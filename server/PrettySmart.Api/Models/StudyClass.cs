using System.Text.Json;
using System.Text.Json.Serialization;

namespace PrettySmart.Api.Models;

/// <summary>A class the user is studying (e.g. "MIS 405"). Row in the <c>classes</c> table.</summary>
public sealed record StudyClass(
    [property: JsonConverter(typeof(FlexibleIdConverter))] string Id,
    string Name,
    string UserId);

public sealed record CreateClassRequest(string? Name);

/// <summary>Reads an id column whether the table stores it as a number (int8) or a string (uuid).</summary>
public sealed class FlexibleIdConverter : JsonConverter<string>
{
    public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Number
            ? reader.GetInt64().ToString()
            : reader.GetString() ?? "";

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value);
}
