using System.Text.Json;
using System.Text.Json.Serialization;

namespace PrettySmart.Api.Shop;

/// <summary>Pets are bought one at a time and live in the pets table; equipment and food go in inventory.</summary>
public enum ShopItemKind { Fish, Cat, Food, Equipment }

/// <summary>
/// Something sold in the pet shop. <c>Id</c> matches the game's image name,
/// <c>Type</c> is the breed or family (e.g. "Siberian", "Cichlid"),
/// and <c>Care</c> is 1 (easy) to 3 (needs extra attention).
/// </summary>
/// <param name="Requires">
/// What you must own before buying this pet. Each entry is one item id, or a list of ids where any one counts
/// (e.g. <c>["waterbowl", "fountain"]</c>).
/// </param>
/// <param name="PetsPerSet">
/// How many pets of this kind one set of the required items covers (cats: 2). Null = one set covers any number.
/// </param>
/// <param name="Group">Items that share a limit, e.g. every tank is in group "tank".</param>
public sealed record ShopItem(
    string Id, ShopItemKind Kind, string Name, string Type, int Price, string Description,
    IReadOnlyList<string> Personality, int Care,
    [property: JsonConverter(typeof(RequirementsConverter))] IReadOnlyList<IReadOnlyList<string>>? Requires = null,
    int? PetsPerSet = null,
    string? Group = null)
{
    public bool IsPet => Kind is ShopItemKind.Cat or ShopItemKind.Fish;
}

/// <summary>Reads <c>"requires"</c> entries written either as "id" or as ["id", "other-id"].</summary>
public sealed class RequirementsConverter : JsonConverter<IReadOnlyList<IReadOnlyList<string>>>
{
    public override IReadOnlyList<IReadOnlyList<string>> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.StartArray) throw new JsonException("\"requires\" must be a list.");
        var groups = new List<IReadOnlyList<string>>();
        while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
        {
            if (reader.TokenType == JsonTokenType.String) groups.Add([reader.GetString()!]);
            else if (reader.TokenType == JsonTokenType.StartArray)
                groups.Add(JsonSerializer.Deserialize<List<string>>(ref reader, options) ?? []);
            else throw new JsonException("Each \"requires\" entry must be an item id or a list of item ids.");
        }
        return groups;
    }

    public override void Write(Utf8JsonWriter writer, IReadOnlyList<IReadOnlyList<string>> value, JsonSerializerOptions options) =>
        JsonSerializer.Serialize(writer, value.Select(g => g.ToArray()).ToArray(), options);
}

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
            if (item.IsPet ? item.Care is < 1 or > 3 : item.Care is < 0 or > 3)
                problems.Add($"{who} needs a care level of 1, 2 or 3");
            if (item.PetsPerSet is < 1) problems.Add($"{who} needs petsPerSet of at least 1");
        }
        foreach (var dupe in items.GroupBy(i => i.Id).Where(g => g.Count() > 1))
            problems.Add($"\"{dupe.Key}\" is listed more than once");

        var ids = items.Select(i => i.Id).ToHashSet();
        foreach (var item in items)
            foreach (var missing in (item.Requires ?? []).SelectMany(g => g).Where(r => !ids.Contains(r)))
                problems.Add($"\"{item.Id}\" requires \"{missing}\", which isn't in the catalog");

        if (problems.Count > 0) throw new InvalidDataException(string.Join("; ", problems));

        return items
            .Select(i => i with { Type = i.Type ?? "", Description = i.Description ?? "", Personality = i.Personality ?? [], Requires = i.Requires ?? [] })
            .ToList();
    }
}
