using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PrettySmart.Api.Ai;

/// <summary>Settings for OpenAI. The key is a secret: user-secrets locally, <c>OpenAI__ApiKey</c> in Azure.</summary>
public sealed class OpenAiOptions
{
    public const string Section = "OpenAI";

    public string? ApiKey { get; init; }
    public string Model { get; init; } = "gpt-4.1-mini";
    public string BaseUrl { get; init; } = "https://api.openai.com/v1/";

    /// <summary>Spending guard: generations allowed per player per day.</summary>
    public int DailyLimit { get; init; } = 25;
}

/// <summary>A problem talking to OpenAI, with a message that's safe to show the player.</summary>
public sealed class AiException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>Minimal OpenAI Chat Completions client that asks for JSON matching a schema.</summary>
public sealed class OpenAiClient(HttpClient http, IOptions<OpenAiOptions> options, ILogger<OpenAiClient> logger)
{
    private readonly OpenAiOptions _opt = options.Value;

    public bool Configured => !string.IsNullOrWhiteSpace(_opt.ApiKey);

    /// <summary>Sends the prompt and returns the model's JSON reply (already checked against the schema by OpenAI).</summary>
    public async Task<JsonDocument> CompleteJsonAsync(string system, string user, string schemaName, object schema, CancellationToken ct)
    {
        if (!Configured)
            throw new AiException(503, "AI generation isn't set up yet (missing OpenAI API key).");

        using var req = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(_opt.BaseUrl), "chat/completions"));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opt.ApiKey);
        req.Content = JsonContent.Create(new
        {
            model = _opt.Model,
            messages = new object[]
            {
                new { role = "system", content = system },
                new { role = "user", content = user },
            },
            response_format = new
            {
                type = "json_schema",
                json_schema = new { name = schemaName, strict = true, schema },
            },
        });

        using var res = await http.SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            logger.LogWarning("OpenAI returned {Status}: {Body}", (int)res.StatusCode, body);
            throw res.StatusCode switch
            {
                HttpStatusCode.Unauthorized => new AiException(502, "OpenAI rejected the API key."),
                HttpStatusCode.TooManyRequests => new AiException(429, "OpenAI is busy or the account is out of credit. Try again later."),
                HttpStatusCode.BadRequest => new AiException(502, "OpenAI couldn't process that request. Try shorter text."),
                _ => new AiException(502, "OpenAI had a problem. Try again in a moment."),
            };
        }

        using var doc = JsonDocument.Parse(body);
        var message = doc.RootElement.GetProperty("choices")[0].GetProperty("message");
        if (message.TryGetProperty("refusal", out var refusal) && refusal.ValueKind == JsonValueKind.String)
            throw new AiException(422, "The AI declined to work with that text.");

        var content = message.GetProperty("content").GetString()
            ?? throw new AiException(502, "OpenAI sent back an empty answer.");
        return JsonDocument.Parse(content);
    }
}
