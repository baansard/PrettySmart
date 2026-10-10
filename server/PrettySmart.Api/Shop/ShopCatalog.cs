using System.Text.Json;
using System.Text.Json.Serialization;

namespace PrettySmart.Api.Shop;

public enum ShopItemKind { Fish, Cat, Food }

/// <summary>
/// Something sold in the pet shop. <c>Id</c> matches the game's image name,
/// <c>Type</c> is the breed or family (e.g. "Siberian", "Cichlid"),
/// and <c>Care</c> is 1 (easy) to 3 (needs extra attention).
/// </summary>
public sealed record ShopItem(
    string Id, ShopItemKind Kind, string Name, string Type, int Price, string Description,
    IReadOnlyList<string> Personality, int Care);

/// <summary>
/// Everything the pet shop sells, read from <c>Shop/catalog.json</c>. The file is re-read whenever
/// it changes, so edits show up on the next page refresh. If an edit breaks the file, the last
/// good version keeps being served and the problem is logged.
/// </summary>
public sealed class ShopCatalog(string path, ILogger<ShopCatalog> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private readonly Lock _lock = new();
    private IReadOnlyList<ShopItem> _items = [];
    private DateTime _loadedWriteTime;

    public string Path { get; } = path;

    public IReadOnlyList<ShopItem> Items
    {
        get
        {
            lock (_lock)
            {
                var writeTime = File.GetLastWriteTimeUtc(Path);
                if (writeTime != _loadedWriteTime)
                {
                    _loadedWriteTime = writeTime;
                    try
                    {
                        _items = Load(File.ReadAllText(Path));
                    }
                    catch (Exception ex) when (ex is JsonException or InvalidDataException or IOException)
                    {
                        logger.LogError("Couldn't read {Path}, still using the previous version: {Message}", Path, ex.Message);
                    }
                }
                return _items;
            }
        }
    }

    public ShopItem? Find(string id) => Items.FirstOrDefault(i => i.Id == id);

    /// <summary>Parses and checks catalog JSON. Throws with a readable message if something's off.</summary>
    public static IReadOnlyList<ShopItem> Load(string json)
    {
        var items = JsonSerializer.Deserialize<List<ShopItem>>(json, Json)
            ?? throw new InvalidDataException("The catalog is empty.");

        var problems = new List<string>();
        foreach (var (item, n) in items.Select((item, i) => (item, i + 1)))
        {
            var who = string.IsNullOrWhiteSpace(item.Id) ? $"item #{n}" : $"\"{item.Id}\"";
            if (string.IsNullOrWhiteSpace(item.Id)) problems.Add($"{who} is missing an id");
            if (string.IsNullOrWhiteSpace(item.Name)) problems.Add($"{who} is missing a name");
            if (item.Price <= 0) problems.Add($"{who} needs a price above 0");
            if (item.Care is < 1 or > 3) problems.Add($"{who} needs a care level of 1, 2 or 3");
        }
        foreach (var dupe in items.GroupBy(i => i.Id).Where(g => g.Count() > 1))
            problems.Add($"\"{dupe.Key}\" is listed more than once");

        if (problems.Count > 0) throw new InvalidDataException(string.Join("; ", problems));

        return items
            .Select(i => i with { Type = i.Type ?? "", Description = i.Description ?? "", Personality = i.Personality ?? [] })
            .ToList();
    }
}
