namespace PrettySmart.Api.Supabase;

/// <summary>Settings for the Supabase project. Both values are public (they also ship in the browser game).</summary>
public sealed class SupabaseOptions
{
    public const string Section = "Supabase";

    /// <summary>Project URL, e.g. https://abc123.supabase.co</summary>
    public required string Url { get; init; }

    /// <summary>Publishable (anon) key. Row Level Security still applies to every request.</summary>
    public required string PublishableKey { get; init; }

    /// <summary>
    /// Server-only secret key (bypasses Row Level Security). Never put this in appsettings.json or the browser:
    /// set it with <c>dotnet user-secrets</c> locally and as the <c>Supabase__SecretKey</c> app setting in Azure.
    /// </summary>
    public string? SecretKey { get; init; }

    public string AuthIssuer => $"{Url.TrimEnd('/')}/auth/v1";
}
