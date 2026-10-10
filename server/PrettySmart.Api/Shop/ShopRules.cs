using System.Text.Json.Serialization;
using PrettySmart.Api.Models;

namespace PrettySmart.Api.Shop;

/// <summary>A pet the player owns. <c>Kind</c> is "cat" or "fish"; <c>Status</c> is healthy, sick or dead.</summary>
public sealed record OwnedPet(
    [property: JsonConverter(typeof(FlexibleIdConverter))] string Id,
    string SpeciesId, string Kind, string? Nickname, string Status)
{
    public bool Alive => Status != "dead";
}

public sealed record InventoryRow(string ItemId, int Quantity);

/// <summary>Everything the player owns, as the rules need it.</summary>
public sealed record Ownership(IReadOnlyDictionary<string, int> Inventory, IReadOnlyList<OwnedPet> Pets)
{
    public static Ownership From(IEnumerable<InventoryRow> inventory, IReadOnlyList<OwnedPet> pets) =>
        new(inventory.GroupBy(i => i.ItemId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity)), pets);

    public int Count(string itemId) => Inventory.GetValueOrDefault(itemId);
}

/// <summary>One line of a pet's "you need this first" checklist.</summary>
public sealed record RequirementStatus(string Label, IReadOnlyList<string> ItemIds, int Have, int Need)
{
    public bool Met => Have >= Need;
}

/// <summary>Whether an item can be bought right now, and why not.</summary>
public sealed record BuyCheck(
    string ItemId, bool CanBuy, string? Reason, string? Message,
    int Price, int Coins, int Owned, IReadOnlyList<RequirementStatus> Requirements);

/// <summary>The pet shop's buying rules. Pure logic — no database — so it's easy to test.</summary>
public static class ShopRules
{
    /// <summary>How many items of a group you can own. Raise "tank" when the house expansion exists.</summary>
    public static readonly IReadOnlyDictionary<string, int> GroupLimits = new Dictionary<string, int>
    {
        ["tank"] = 2,
    };

    public static BuyCheck Check(ShopItem item, IReadOnlyList<ShopItem> catalog, Ownership own, int coins)
    {
        var names = catalog.ToDictionary(i => i.Id, i => i.Name);
        var kind = item.Kind.ToString().ToLowerInvariant();

        var owned = item.IsPet
            ? own.Pets.Count(p => p.SpeciesId == item.Id && p.Alive)
            : own.Count(item.Id);

        // Requirements: one set covers PetsPerSet pets of this kind (e.g. 2 cats), so the 3rd cat needs a 2nd set.
        var requirements = new List<RequirementStatus>();
        if (item.IsPet && item.Requires is { Count: > 0 })
        {
            var petsOfKind = own.Pets.Count(p => p.Kind == kind && p.Alive);
            var setsNeeded = item.PetsPerSet is int perSet ? (petsOfKind + perSet) / perSet : 1;
            foreach (var options in item.Requires)
            {
                var label = string.Join(" or ", options.Select(id => names.GetValueOrDefault(id, id)));
                requirements.Add(new(label, options, options.Sum(own.Count), setsNeeded));
            }
        }

        var (reason, message) = (null as string, null as string);

        if (item.Group is { } group && GroupLimits.TryGetValue(group, out var limit)
            && catalog.Where(i => i.Group == group).Sum(i => own.Count(i.Id)) >= limit)
        {
            (reason, message) = ("group_limit", $"You can only have {limit} {group}s for now.");
        }
        else if (requirements.Where(r => !r.Met).ToList() is { Count: > 0 } missing)
        {
            (reason, message) = ("missing_requirements", "You need " + string.Join(", ", missing.Select(r =>
                r.Need > 1 ? $"{r.Need - r.Have} more {r.Label}" : r.Label)) + " first.");
        }
        else if (coins < item.Price)
        {
            (reason, message) = ("not_enough_coins", $"You need {item.Price - coins:N0} more coins.");
        }

        return new BuyCheck(item.Id, reason is null, reason, message, item.Price, coins, owned, requirements);
    }
}
