using PrettySmart.Api.Shop;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Endpoints;

public sealed record CoinsResult(int Coins);

public static class ShopEndpoints
{
    public static void MapShopEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/shop/items", (ShopCatalog catalog) => catalog.Items).RequireAuthorization();

        app.MapGet("/api/shop/items/{id}", (string id, ShopCatalog catalog) =>
            catalog.Find(id) is { } item ? Results.Ok(item) : Results.NotFound())
            .RequireAuthorization();

        // Coins = everything earned from quizzes (spending comes off this once buying exists).
        app.MapGet("/api/coins", async (SupabaseRest db, CancellationToken ct) =>
            new CoinsResult(await QuizEndpoints.TotalPoints(db, ct)))
            .RequireAuthorization();
    }
}
