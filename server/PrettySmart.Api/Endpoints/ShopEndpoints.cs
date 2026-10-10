using System.Security.Claims;
using System.Text.Json.Serialization;
using PrettySmart.Api.Models;
using PrettySmart.Api.Shop;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Endpoints;

public sealed record CoinsResult(int Coins);
public sealed record BuyRequest(string? ItemId);
public sealed record BuyResult(int Coins, string? PetId, BuyCheck Check);
public sealed record MeResult(int Coins, IReadOnlyList<OwnedPet> Pets, IReadOnlyList<InventoryRow> Inventory);
public sealed record RenameRequest(string? Nickname);

/// <summary>What the buy_item database function returns.</summary>
public sealed record BuyRpcResult(
    bool Ok, string? Reason, int Balance,
    [property: JsonConverter(typeof(FlexibleIdConverter))] string? PetId);

public static class ShopEndpoints
{
    public const int MaxNicknameLength = 40;

    public static void MapShopEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();

        api.MapGet("/shop/items", (ShopCatalog catalog) => catalog.Items);

        api.MapGet("/shop/items/{id}", (string id, ShopCatalog catalog) =>
            catalog.Find(id) is { } item ? Results.Ok(item) : Results.NotFound());

        api.MapGet("/coins", async (ClaimsPrincipal user, SupabaseAdmin admin, CancellationToken ct) =>
            new CoinsResult(await Wallet.BalanceAsync(admin, user, ct)));

        // Can I buy this? Returns the requirement checklist and the reason if not.
        api.MapGet("/shop/check/{id}", async (string id, ClaimsPrincipal user, ShopCatalog catalog,
            SupabaseRest db, SupabaseAdmin admin, CancellationToken ct) =>
        {
            if (catalog.Find(id) is not { } item) return Results.NotFound();
            var (own, coins) = await LoadAsync(user, db, admin, ct);
            return Results.Ok(ShopRules.Check(item, catalog.Items, own, coins));
        });

        // Buy one item. The price always comes from the catalog, never from the browser.
        api.MapPost("/shop/buy", async (BuyRequest body, ClaimsPrincipal user, ShopCatalog catalog,
            SupabaseRest db, SupabaseAdmin admin, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.ItemId) || catalog.Find(body.ItemId) is not { } item)
                return Results.NotFound();

            var (own, coins) = await LoadAsync(user, db, admin, ct);
            var check = ShopRules.Check(item, catalog.Items, own, coins);
            if (!check.CanBuy) return Results.Conflict(check);

            var result = await admin.RpcAsync<BuyRpcResult>("buy_item", new
            {
                p_user = user.UserId(),
                p_item = item.Id,
                p_kind = item.Kind.ToString().ToLowerInvariant(),
                p_price = item.Price,
            }, ct);
            if (!result.Ok)
                return Results.Conflict(check with { CanBuy = false, Reason = result.Reason, Coins = result.Balance,
                    Message = $"You need {item.Price - result.Balance:N0} more coins." });

            var (after, balance) = await LoadAsync(user, db, admin, ct);
            return Results.Ok(new BuyResult(balance, result.PetId, ShopRules.Check(item, catalog.Items, after, balance)));
        });

        // Everything you own, plus your coins.
        api.MapGet("/me", async (ClaimsPrincipal user, SupabaseRest db, SupabaseAdmin admin, CancellationToken ct) =>
        {
            var pets = db.GetAsync<OwnedPet>("pets?select=id,species_id,kind,nickname,status&order=id", ct);
            var inventory = db.GetAsync<InventoryRow>("inventory?select=item_id,quantity&quantity=gt.0&order=item_id", ct);
            var coins = Wallet.BalanceAsync(admin, user, ct);
            await Task.WhenAll(pets, inventory, coins);
            return new MeResult(coins.Result, pets.Result, inventory.Result);
        });

        // Name (or rename) one of your pets.
        api.MapPatch("/pets/{id}", async (string id, RenameRequest body, ClaimsPrincipal user, SupabaseAdmin admin, CancellationToken ct) =>
        {
            var name = body.Nickname?.Trim();
            if (name is { Length: > MaxNicknameLength })
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["nickname"] = [$"Names can be up to {MaxNicknameLength} characters."] });

            var changed = await admin.UpdateAsync(
                $"pets?id=eq.{Uri.EscapeDataString(id)}&user_id=eq.{Uri.EscapeDataString(user.UserId())}",
                new { nickname = string.IsNullOrEmpty(name) ? null : name }, ct);
            return changed > 0 ? Results.NoContent() : Results.NotFound();
        });
    }

    private static async Task<(Ownership Own, int Coins)> LoadAsync(
        ClaimsPrincipal user, SupabaseRest db, SupabaseAdmin admin, CancellationToken ct)
    {
        var pets = db.GetAsync<OwnedPet>("pets?select=id,species_id,kind,nickname,status", ct);
        var inventory = db.GetAsync<InventoryRow>("inventory?select=item_id,quantity", ct);
        var coins = Wallet.BalanceAsync(admin, user, ct);
        await Task.WhenAll(pets, inventory, coins);
        return (Ownership.From(inventory.Result, pets.Result), coins.Result);
    }
}
