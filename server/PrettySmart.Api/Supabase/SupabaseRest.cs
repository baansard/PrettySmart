using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PrettySmart.Api.Supabase;

/// <summary>
/// Thin client for Supabase's REST (PostgREST) API. Every call is made *as the signed-in user*
/// by forwarding their access token, so the database's Row Level Security policies keep
/// applying and this server never needs an admin key.
/// </summary>
public sealed class SupabaseRest(HttpClient http, IOptions<SupabaseOptions> options, IHttpContextAccessor context)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    private readonly SupabaseOptions _opt = options.Value;

    public async Task<List<T>> GetAsync<T>(string tableAndQuery, CancellationToken ct = default)
    {
        using var req = Build(HttpMethod.Get, tableAndQuery);
        using var res = await Send(req, ct);
        return await res.Content.ReadFromJsonAsync<List<T>>(Json, ct) ?? [];
    }

    /// <summary>Counts matching rows without downloading them (PostgREST "count=exact").</summary>
    public async Task<int> CountAsync(string tableAndFilter, CancellationToken ct = default)
    {
        using var req = Build(HttpMethod.Get, tableAndFilter + (tableAndFilter.Contains('?') ? "&" : "?") + "limit=0");
        req.Headers.Add("Prefer", "count=exact");
        using var res = await Send(req, ct);

        // PostgREST replies "Content-Range: */57" (no unit, so .NET won't parse it as a typed header).
        var range = res.Content.Headers.NonValidated.TryGetValues("Content-Range", out var values) ? values.ToString() : "";
        var slash = range.LastIndexOf('/');
        return slash >= 0 && int.TryParse(range[(slash + 1)..], out var total) ? total : 0;
    }

    public async Task<T> InsertAsync<T>(string table, object row, CancellationToken ct = default)
    {
        using var req = Build(HttpMethod.Post, table);
        req.Headers.Add("Prefer", "return=representation");
        req.Content = JsonContent.Create(row, options: Json);
        using var res = await Send(req, ct);
        var rows = await res.Content.ReadFromJsonAsync<List<T>>(Json, ct);
        return rows is [var first, ..] ? first : throw new InvalidOperationException($"Insert into {table} returned no row.");
    }

    /// <summary>Deletes matching rows and returns how many were removed (0 if none, or RLS hid them).</summary>
    public async Task<int> DeleteAsync(string tableAndFilter, CancellationToken ct = default)
    {
        using var req = Build(HttpMethod.Delete, tableAndFilter);
        req.Headers.Add("Prefer", "return=representation");
        using var res = await Send(req, ct);
        var rows = await res.Content.ReadFromJsonAsync<List<JsonElement>>(Json, ct);
        return rows?.Count ?? 0;
    }

    private HttpRequestMessage Build(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, $"{_opt.Url.TrimEnd('/')}/rest/v1/{path}");
        req.Headers.Add("apikey", _opt.PublishableKey);

        // Forward the caller's token (already validated by the JWT middleware).
        var auth = context.HttpContext?.Request.Headers.Authorization.ToString();
        if (AuthenticationHeaderValue.TryParse(auth, out var header) && header.Scheme == "Bearer")
            req.Headers.Authorization = header;

        return req;
    }

    private async Task<HttpResponseMessage> Send(HttpRequestMessage req, CancellationToken ct)
    {
        var res = await http.SendAsync(req, ct);
        if (res.IsSuccessStatusCode) return res;

        var body = await res.Content.ReadAsStringAsync(ct);
        res.Dispose();
        throw new SupabaseException((int)res.StatusCode, body);
    }
}

public sealed class SupabaseException(int status, string body)
    : Exception($"Supabase returned {status}: {body}")
{
    public int Status { get; } = status;
}
