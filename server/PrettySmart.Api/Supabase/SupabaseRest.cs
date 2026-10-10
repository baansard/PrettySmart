using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PrettySmart.Api.Supabase;

/// <summary>Shared plumbing for calling Supabase's REST (PostgREST) API.</summary>
public abstract class SupabaseClient(HttpClient http, SupabaseOptions options)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    protected SupabaseOptions Options { get; } = options;

    /// <summary>Adds the apikey / Authorization headers for this kind of caller.</summary>
    protected abstract void Authorize(HttpRequestMessage req);

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

    /// <summary>Updates matching rows and returns how many changed.</summary>
    public async Task<int> UpdateAsync(string tableAndFilter, object changes, CancellationToken ct = default)
    {
        using var req = Build(HttpMethod.Patch, tableAndFilter);
        req.Headers.Add("Prefer", "return=representation");
        req.Content = JsonContent.Create(changes, options: Json);
        using var res = await Send(req, ct);
        var rows = await res.Content.ReadFromJsonAsync<List<JsonElement>>(Json, ct);
        return rows?.Count ?? 0;
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

    /// <summary>Calls a Postgres function (<c>/rest/v1/rpc/name</c>) and reads its result.</summary>
    public async Task<T> RpcAsync<T>(string function, object args, CancellationToken ct = default)
    {
        using var req = Build(HttpMethod.Post, $"rpc/{function}");
        req.Content = JsonContent.Create(args, options: Json);
        using var res = await Send(req, ct);
        return await res.Content.ReadFromJsonAsync<T>(Json, ct)
            ?? throw new InvalidOperationException($"{function} returned nothing.");
    }

    private HttpRequestMessage Build(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, $"{Options.Url.TrimEnd('/')}/rest/v1/{path}");
        Authorize(req);
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

/// <summary>
/// Calls Supabase *as the signed-in user* by forwarding their access token, so Row Level Security
/// decides what they can see. Use this for reading the player's own data.
/// </summary>
public sealed class SupabaseRest(HttpClient http, IOptions<SupabaseOptions> options, IHttpContextAccessor context)
    : SupabaseClient(http, options.Value)
{
    protected override void Authorize(HttpRequestMessage req)
    {
        req.Headers.Add("apikey", Options.PublishableKey);

        // Forward the caller's token (already validated by the JWT middleware).
        var auth = context.HttpContext?.Request.Headers.Authorization.ToString();
        if (AuthenticationHeaderValue.TryParse(auth, out var header) && header.Scheme == "Bearer")
            req.Headers.Authorization = header;
    }
}

/// <summary>
/// Calls Supabase *as the server* with the secret key, which bypasses Row Level Security.
/// Use only for writes the game rules control (quiz answers, purchases, pets) — always filter by
/// the user id from the verified token.
/// </summary>
public sealed class SupabaseAdmin(HttpClient http, IOptions<SupabaseOptions> options)
    : SupabaseClient(http, options.Value)
{
    protected override void Authorize(HttpRequestMessage req)
    {
        var key = Options.SecretKey;
        if (string.IsNullOrWhiteSpace(key))
            throw new InvalidOperationException(
                "Supabase:SecretKey isn't set. Add the Supabase secret key to user-secrets (locally) or the App Service settings (Azure).");

        req.Headers.Add("apikey", key);

        // New-style secret keys (sb_secret_…) go only in apikey; legacy service_role JWTs also go in Authorization.
        if (!key.StartsWith("sb_secret_", StringComparison.Ordinal))
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
    }
}

public sealed class SupabaseException(int status, string body)
    : Exception($"Supabase returned {status}: {body}")
{
    public int Status { get; } = status;
}
