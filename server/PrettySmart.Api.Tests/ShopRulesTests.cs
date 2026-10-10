using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using PrettySmart.Api.Endpoints;
using PrettySmart.Api.Shop;

namespace PrettySmart.Api.Tests;

public class ShopRulesTests
{
    private static readonly IReadOnlyList<ShopItem> Catalog = ShopCatalog.Load(File.ReadAllText(
        Path.Combine(ShopCatalogTests.RepoRoot(), "server", "PrettySmart.Api", "Shop", "catalog.json")));

    private static ShopItem Item(string id) => Catalog.Single(i => i.Id == id);

    private static Ownership Own(Dictionary<string, int>? inventory = null, params (string Species, string Kind)[] pets) =>
        new(inventory ?? [], pets.Select((p, i) => new OwnedPet($"{i + 1}", p.Species, p.Kind, null, "healthy")).ToList());

    private static readonly Dictionary<string, int> OneCatSet = new() { ["foodbowl"] = 1, ["waterbowl"] = 1, ["scratchingpost"] = 1 };

    [Fact]
    public void Cat_needs_bowls_and_post_first()
    {
        var check = ShopRules.Check(Item("cat"), Catalog, Own(), coins: 5000);

        Assert.False(check.CanBuy);
        Assert.Equal("missing_requirements", check.Reason);
        Assert.Equal(3, check.Requirements.Count);
        Assert.All(check.Requirements, r => Assert.False(r.Met));
        Assert.Contains(check.Requirements, r => r.Label == "Water Bowl or Water Fountain");
    }

    [Fact]
    public void Fountain_counts_instead_of_water_bowl()
    {
        var inventory = new Dictionary<string, int> { ["foodbowl"] = 1, ["fountain"] = 1, ["scratchingpost"] = 1 };
        Assert.True(ShopRules.Check(Item("cat"), Catalog, Own(inventory), coins: 5000).CanBuy);
    }

    [Fact]
    public void One_set_covers_two_cats_and_the_third_needs_another_set()
    {
        Assert.True(ShopRules.Check(Item("bingus"), Catalog, Own(OneCatSet, ("cat", "cat")), 5000).CanBuy);

        var third = ShopRules.Check(Item("bingus"), Catalog, Own(OneCatSet, ("cat", "cat"), ("felix", "cat")), 5000);
        Assert.False(third.CanBuy);
        Assert.All(third.Requirements, r => Assert.Equal(2, r.Need));
        Assert.Contains("1 more Food Bowl", third.Message);
    }

    [Fact]
    public void Dead_pets_dont_use_up_equipment()
    {
        var own = new Ownership(OneCatSet, [
            new("1", "cat", "cat", null, "healthy"),
            new("2", "felix", "cat", null, "dead"),
        ]);
        Assert.True(ShopRules.Check(Item("sphynx"), Catalog, own, 5000).CanBuy);
    }

    [Fact]
    public void Big_fish_need_the_big_tank()
    {
        var withSmallTank = Own(new() { ["tank10"] = 1 });
        Assert.True(ShopRules.Check(Item("neontetra"), Catalog, withSmallTank, 500).CanBuy);
        Assert.False(ShopRules.Check(Item("discus"), Catalog, withSmallTank, 500).CanBuy);
        Assert.True(ShopRules.Check(Item("discus"), Catalog, Own(new() { ["tank20"] = 1 }), 500).CanBuy);
    }

    [Fact]
    public void At_most_two_tanks()
    {
        var check = ShopRules.Check(Item("tank20"), Catalog, Own(new() { ["tank10"] = 1, ["tank20"] = 1 }), 5000);
        Assert.Equal("group_limit", check.Reason);
        Assert.True(ShopRules.Check(Item("tank20"), Catalog, Own(new() { ["tank10"] = 1 }), 5000).CanBuy);
    }

    [Fact]
    public void Not_enough_coins_says_how_many_more()
    {
        var check = ShopRules.Check(Item("fountain"), Catalog, Own(), coins: 100);
        Assert.Equal("not_enough_coins", check.Reason);
        Assert.Contains("150 more coins", check.Message);
    }

    [Fact]
    public void Food_and_equipment_report_how_many_you_have()
    {
        var check = ShopRules.Check(Item("drycatfood"), Catalog, Own(new() { ["drycatfood"] = 3 }), 100);
        Assert.True(check.CanBuy);
        Assert.Equal(3, check.Owned);
    }

    [Fact]
    public void Catalog_rejects_requirements_that_dont_exist()
    {
        var ex = Assert.Throws<InvalidDataException>(() => ShopCatalog.Load(
            """[{"id":"a","kind":"cat","name":"A","price":5,"care":1,"requires":["unicornbowl"]}]"""));
        Assert.Contains("unicornbowl", ex.Message);
    }
}

public class BuyEndpointTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Buying_uses_the_catalog_price_and_the_token_user()
    {
        var supabase = new FakeSupabase()
            .On("rpc/buy_item", """{"ok":true,"balance":50,"petId":null}""")
            .On("rpc/coin_balance", "300")
            .On("inventory", "[]")
            .On("pets", "[]");

        var res = await factory.SignedInClient(supabase).PostAsJsonAsync("/api/shop/buy", new { itemId = "fountain", price = 1 });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var buy = supabase.Calls.Single(c => c.Request.RequestUri!.AbsolutePath.EndsWith("/rpc/buy_item"));
        using var args = JsonDocument.Parse(buy.Body!);
        Assert.Equal("user-1", args.RootElement.GetProperty("p_user").GetString());
        Assert.Equal("fountain", args.RootElement.GetProperty("p_item").GetString());
        Assert.Equal("equipment", args.RootElement.GetProperty("p_kind").GetString());
        Assert.Equal(250, args.RootElement.GetProperty("p_price").GetInt32()); // not the 1 the browser sent
    }

    [Fact]
    public async Task Cant_buy_a_cat_without_supplies()
    {
        var supabase = new FakeSupabase()
            .On("rpc/coin_balance", "9999")
            .On("inventory", "[]")
            .On("pets", "[]");

        var res = await factory.SignedInClient(supabase).PostAsJsonAsync("/api/shop/buy", new { itemId = "cat" });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var check = await res.Content.ReadFromJsonAsync<BuyCheck>(JsonSerializerOptions.Web);
        Assert.Equal("missing_requirements", check!.Reason);
        Assert.DoesNotContain(supabase.Calls, c => c.Request.RequestUri!.AbsolutePath.EndsWith("/rpc/buy_item"));
    }

    [Fact]
    public async Task Database_balance_check_has_the_final_say()
    {
        var supabase = new FakeSupabase()
            .On("rpc/buy_item", """{"ok":false,"reason":"not_enough_coins","balance":10,"petId":null}""")
            .On("rpc/coin_balance", "100")
            .On("inventory", "[]")
            .On("pets", "[]");

        var res = await factory.SignedInClient(supabase).PostAsJsonAsync("/api/shop/buy", new { itemId = "drycatfood" });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Renaming_only_touches_your_own_pet()
    {
        var supabase = new FakeSupabase().On("pets", """[{"id":5}]""", HttpMethod.Patch);

        var res = await factory.SignedInClient(supabase).PatchAsJsonAsync("/api/pets/5", new { nickname = "  Mochi " });

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        var call = supabase.Calls.Single();
        Assert.Contains("user_id=eq.user-1", call.Request.RequestUri!.ToString());
        Assert.Contains("\"nickname\":\"Mochi\"", call.Body);
    }

    [Fact]
    public async Task Names_have_a_length_limit()
    {
        var res = await factory.SignedInClient(new FakeSupabase())
            .PatchAsJsonAsync("/api/pets/5", new { nickname = new string('x', ShopEndpoints.MaxNicknameLength + 1) });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
