using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Tests;

public static class TestHelpers
{
    /// <summary>A client signed in as user-1 whose Supabase calls go to <paramref name="supabase"/>.</summary>
    public static HttpClient SignedInClient(this WebApplicationFactory<Program> factory, FakeSupabase supabase,
        HttpMessageHandler? openAi = null, int aiDailyLimit = 25)
    {
        var client = factory.WithWebHostBuilder(b => b
            .UseSetting("Supabase:SecretKey", "sb_secret_test")
            .UseSetting("OpenAI:ApiKey", openAi is null ? "" : "sk-test")
            .UseSetting("OpenAI:DailyLimit", aiDailyLimit.ToString())
            .ConfigureTestServices(services =>
        {
            services.AddAuthentication(TestAuth.Name)
                .AddScheme<AuthenticationSchemeOptions, TestAuth>(TestAuth.Name, _ => { });
            services.AddHttpClient<SupabaseRest>().ConfigurePrimaryHttpMessageHandler(() => supabase);
            services.AddHttpClient<SupabaseAdmin>().ConfigurePrimaryHttpMessageHandler(() => supabase);
            if (openAi is not null)
                services.AddHttpClient<PrettySmart.Api.Ai.OpenAiClient>().ConfigurePrimaryHttpMessageHandler(() => openAi);
        })).CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", "test-token");
        return client;
    }
}

/// <summary>Signs every request in as user-1.</summary>
public sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> o, ILoggerFactory l, UrlEncoder e)
    : AuthenticationHandler<AuthenticationSchemeOptions>(o, l, e)
{
    public const string Name = "Test";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var identity = new ClaimsIdentity([new Claim("sub", "user-1")], Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new(identity), Name)));
    }
}

/// <summary>
/// Stands in for Supabase's REST API. Replies with the first route whose text appears in the
/// request URL (or the default reply), and records everything sent to it.
/// </summary>
public sealed class FakeSupabase(string defaultJson = "[]", HttpStatusCode defaultStatus = HttpStatusCode.OK) : HttpMessageHandler
{
    private readonly List<(HttpMethod? Method, string UrlPart, string Json, string? ContentRange)> _routes = [];

    public List<(HttpRequestMessage Request, string? Body)> Calls { get; } = [];
    public HttpRequestMessage? LastRequest => Calls.LastOrDefault().Request;
    public string? LastBody => Calls.LastOrDefault().Body;

    public FakeSupabase On(string urlPart, string json, HttpMethod? method = null, string? contentRange = null)
    {
        _routes.Add((method, urlPart, json, contentRange));
        return this;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
        lock (Calls) Calls.Add((request, body));

        var url = Uri.UnescapeDataString(request.RequestUri!.ToString());
        var route = _routes.FirstOrDefault(r => url.Contains(r.UrlPart) && (r.Method is null || r.Method == request.Method));
        var res = new HttpResponseMessage(route.Json is null ? defaultStatus : HttpStatusCode.OK)
        {
            Content = new StringContent(route.Json ?? defaultJson),
        };
        if (route.ContentRange is not null) res.Content.Headers.TryAddWithoutValidation("Content-Range", route.ContentRange);
        return res;
    }
}
