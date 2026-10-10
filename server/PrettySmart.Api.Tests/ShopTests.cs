using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging.Abstractions;
using PrettySmart.Api.Endpoints;
using PrettySmart.Api.Shop;

namespace PrettySmart.Api.Tests;

public class ShopCatalogTests
{
    private static readonly string CatalogPath =
        Path.Combine(RepoRoot(), "server", "PrettySmart.Api", "Shop", "catalog.json");

    // Loading the real file runs every validation rule (ids unique, prices > 0, care 1–3, …).
    private static IReadOnlyList<ShopItem> RealCatalog() => ShopCatalog.Load(File.ReadAllText(CatalogPath));

    [Fact]
    public void Real_catalog_is_valid() => Assert.NotEmpty(RealCatalog());

    [Fact]
    public void Every_fish_image_in_the_game_has_a_catalog_entry()
    {
        var ids = RealCatalog().Select(i => i.Id).ToHashSet();
        var fishImages = Directory.GetFiles(Path.Combine(RepoRoot(), "assets", "fish"), "*.png")
            .Select(Path.GetFileNameWithoutExtension);
        Assert.All(fishImages, name => Assert.True(ids.Contains(name!), $"{name}.png has no catalog entry"));
    }

    [Fact]
    public void Every_cat_image_in_the_game_has_a_catalog_entry()
    {
        var cats = RealCatalog().Where(i => i.Kind == ShopItemKind.Cat).Select(i => i.Id).ToHashSet();
        var catImages = Directory.GetFiles(Path.Combine(RepoRoot(), "assets", "cat"), "*front.png")
            .Select(f => Path.GetFileNameWithoutExtension(f)[..^"front".Length]);
        Assert.All(catImages, id => Assert.True(cats.Contains(id), $"{id}front.png has no catalog entry"));
    }

    [Fact]
    public void Every_pet_has_a_type() =>
        Assert.All(RealCatalog().Where(i => i.Kind != ShopItemKind.Food),
            i => Assert.False(string.IsNullOrWhiteSpace(i.Type), $"{i.Id} needs a type"));

    [Theory]
    [InlineData("""[{"id":"a","kind":"fish","name":"A","price":0,"care":1}]""", "price above 0")]
    [InlineData("""[{"id":"a","kind":"fish","name":"A","price":5,"care":7}]""", "care level")]
    [InlineData("""[{"id":"a","kind":"fish","name":"A","price":5,"care":1},{"id":"a","kind":"fish","name":"B","price":5,"care":1}]""", "more than once")]
    public void Mistakes_are_explained(string json, string expected)
    {
        var ex = Assert.Throws<InvalidDataException>(() => ShopCatalog.Load(json));
        Assert.Contains(expected, ex.Message);
    }

    [Fact]
    public void Edits_show_up_and_broken_edits_keep_the_last_good_version()
    {
        var path = Path.GetTempFileName();
        try
        {
            File.WriteAllText(path, """[{"id":"guppy","kind":"fish","name":"Guppy","type":"Livebearer","price":30,"description":"old","personality":[],"care":1}]""");
            var catalog = new ShopCatalog(path, NullLogger<ShopCatalog>.Instance);
            Assert.Equal("old", catalog.Find("guppy")!.Description);

            File.WriteAllText(path, """[{"id":"guppy","kind":"fish","name":"Guppy","type":"Livebearer","price":30,"description":"new","personality":[],"care":1}]""");
            File.SetLastWriteTimeUtc(path, DateTime.UtcNow.AddSeconds(5));
            Assert.Equal("new", catalog.Find("guppy")!.Description);

            File.WriteAllText(path, """[{"id":"guppy", oops""");
            File.SetLastWriteTimeUtc(path, DateTime.UtcNow.AddSeconds(10));
            Assert.Equal("new", catalog.Find("guppy")!.Description);
        }
        finally { File.Delete(path); }
    }

    internal static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "assets"))) dir = dir.Parent;
        return dir?.FullName ?? throw new DirectoryNotFoundException("Couldn't find the repo's assets folder.");
    }
}

public class ShopEndpointsTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Item_profile_includes_name_type_price_and_description()
    {
        var json = await factory.SignedInClient(new FakeSupabase()).GetStringAsync("/api/shop/items/neontetra");
        using var doc = JsonDocument.Parse(json);
        Assert.Equal("Neon Tetra", doc.RootElement.GetProperty("name").GetString());
        Assert.Equal("fish", doc.RootElement.GetProperty("kind").GetString());
        Assert.False(string.IsNullOrEmpty(doc.RootElement.GetProperty("type").GetString()));
        Assert.True(doc.RootElement.GetProperty("price").GetInt32() > 0);
    }

    [Fact]
    public async Task Unknown_item_is_404()
    {
        var res = await factory.SignedInClient(new FakeSupabase()).GetAsync("/api/shop/items/dragon");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Coins_come_from_the_database_balance()
    {
        var supabase = new FakeSupabase().On("rpc/coin_balance", "120");
        var coins = await factory.SignedInClient(supabase).GetFromJsonAsync<CoinsResult>("/api/coins");
        Assert.Equal(120, coins!.Coins);
        var call = supabase.Calls.Single();
        Assert.Contains("\"p_user\":\"user-1\"", call.Body);
        Assert.Equal("sb_secret_test", call.Request.Headers.GetValues("apikey").Single());
        Assert.Null(call.Request.Headers.Authorization); // new-style secret keys go only in apikey
    }
}
