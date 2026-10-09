using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using PrettySmart.Api.Models;

namespace PrettySmart.Api.Tests;

public class ClassEndpointsTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Requests_without_a_token_are_rejected()
    {
        var res = await factory.CreateClient().GetAsync("/api/classes");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Server_source_is_not_served()
    {
        var res = await factory.CreateClient().GetAsync("/server/PrettySmart.Api/Program.cs");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Get_returns_classes_from_supabase()
    {
        var supabase = new FakeSupabase("""[{"id":1,"name":"MIS 405","user_id":"user-1","created_at":"2026-10-01"}]""");

        var classes = await factory.SignedInClient(supabase).GetFromJsonAsync<List<StudyClass>>("/api/classes");

        Assert.Equal("MIS 405", Assert.Single(classes!).Name);
        Assert.Equal("1", classes![0].Id); // numeric ids come back as strings
        Assert.Contains("classes?select=*&order=name", supabase.LastRequest!.RequestUri!.ToString());
        Assert.Equal("Bearer test-token", supabase.LastRequest.Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task Post_sets_owner_from_token_not_body()
    {
        var supabase = new FakeSupabase("""[{"id":"abc","name":"FI 302","user_id":"user-1"}]""");

        var res = await factory.SignedInClient(supabase)
            .PostAsJsonAsync("/api/classes", new { name = "  FI 302  ", user_id = "someone-else" });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        using var sent = JsonDocument.Parse(supabase.LastBody!);
        Assert.Equal("FI 302", sent.RootElement.GetProperty("name").GetString());
        Assert.Equal("user-1", sent.RootElement.GetProperty("user_id").GetString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_rejects_blank_names(string name)
    {
        var supabase = new FakeSupabase();
        var res = await factory.SignedInClient(supabase).PostAsJsonAsync("/api/classes", new { name });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Empty(supabase.Calls); // never reached the database
    }

    [Fact]
    public async Task Delete_returns_404_when_nothing_was_removed()
    {
        var res = await factory.SignedInClient(new FakeSupabase()).DeleteAsync("/api/classes/42");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Supabase_errors_become_502()
    {
        var res = await factory.SignedInClient(new FakeSupabase("""{"message":"boom"}""", HttpStatusCode.InternalServerError))
            .GetAsync("/api/classes");
        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
    }
}
