using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using PrettySmart.Api.Ai;
using PrettySmart.Api.Endpoints;

namespace PrettySmart.Api.Tests;

public class StudyGeneratorTests
{
    private static readonly GenerateRequest Lots = new("x", 10, 10, 10);

    [Fact]
    public void Drops_multiple_choice_whose_answer_isnt_a_choice()
    {
        var clean = StudyGenerator.Clean(new([
            new("Good?", "multiple_choice", ["A", "B", "C"], "b"),
            new("Bad?", "multiple_choice", ["A", "B"], "Z"),
            new("Too few choices?", "multiple_choice", ["A"], "A"),
        ], []), Lots);

        var q = Assert.Single(clean.Questions);
        Assert.Equal("Good?", q.Question);
        Assert.Equal("B", q.CorrectAnswer); // matched to the choice's exact spelling
    }

    [Fact]
    public void Removes_duplicates_blanks_and_extra_choices()
    {
        var clean = StudyGenerator.Clean(new([
            new(" What is GDP? ", "type_in", ["ignored"], " gross domestic product "),
            new("what is gdp?", "type_in", [], "dupe"),
            new("", "type_in", [], "x"),
            new("Five choices?", "multiple_choice", ["A", "B", "C", "D", "E"], "A"),
        ], [
            new("ROI", "Return on investment"),
            new("roi", "dupe"),
            new("Blank", " "),
        ]), Lots);

        Assert.Equal(2, clean.Questions.Count);
        var typeIn = clean.Questions.Single(q => q.Type == "type_in");
        Assert.Equal("What is GDP?", typeIn.Question);
        Assert.Equal("gross domestic product", typeIn.CorrectAnswer);
        Assert.Empty(typeIn.Choices);
        Assert.Equal(4, clean.Questions.Single(q => q.Type == "multiple_choice").Choices.Count);
        Assert.Single(clean.Flashcards);
    }

    [Fact]
    public void Keeps_only_as_many_as_were_asked_for()
    {
        var many = Enumerable.Range(1, 8).Select(i => new DraftQuestion($"Q{i}?", "multiple_choice", ["A", "B"], "A")).ToList();
        var clean = StudyGenerator.Clean(new(many, []), new("x", 3, 0, 0));
        Assert.Equal(3, clean.Questions.Count);
    }

    [Theory]
    [InlineData("short", 5, 0, 0, "at least a paragraph")]
    [InlineData(null, 5, 0, 0, "at least a paragraph")]
    [InlineData("long enough text long enough text long enough text long enough text", 0, 0, 0, "how many")]
    [InlineData("long enough text long enough text long enough text long enough text", 99, 0, 0, "between 0 and")]
    public void Explains_bad_requests(string? text, int mc, int typeIn, int cards, string expected) =>
        Assert.Contains(expected, StudyGenerator.Validate(new(text, mc, typeIn, cards)));
}

public class AiEndpointTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Text = "Gross domestic product (GDP) is the total market value of all final goods and services produced in a country in a year.";

    private static FakeOpenAi Replying(object drafts) => new(JsonSerializer.Serialize(new
    {
        choices = new[] { new { message = new { role = "assistant", content = JsonSerializer.Serialize(drafts), refusal = (string?)null } } },
    }));

    [Fact]
    public async Task Generates_cleaned_drafts_from_pasted_text()
    {
        var openAi = Replying(new
        {
            questions = new object[]
            {
                new { question = "What does GDP measure?", type = "multiple_choice", choices = new[] { "Total output", "Inflation", "Debt", "Exports" }, correctAnswer = "Total output" },
                new { question = "Broken?", type = "multiple_choice", choices = new[] { "A", "B" }, correctAnswer = "C" },
            },
            flashcards = new[] { new { term = "GDP", definition = "Total market value of final goods and services" } },
        });

        var res = await factory.SignedInClient(new FakeSupabase(), openAi)
            .PostAsJsonAsync("/api/ai/generate", new { text = Text, multipleChoice = 2, typeIn = 0, flashcards = 1 });

        res.EnsureSuccessStatusCode();
        var drafts = await res.Content.ReadFromJsonAsync<StudyDrafts>(JsonSerializerOptions.Web);
        Assert.Equal("What does GDP measure?", Assert.Single(drafts!.Questions).Question);
        Assert.Single(drafts.Flashcards);

        // The request asked OpenAI for strict JSON and passed the text and counts along.
        using var sent = JsonDocument.Parse(openAi.LastBody!);
        Assert.Equal("json_schema", sent.RootElement.GetProperty("response_format").GetProperty("type").GetString());
        var prompt = sent.RootElement.GetProperty("messages")[1].GetProperty("content").GetString()!;
        Assert.Contains(Text, prompt);
        Assert.Contains("2 multiple-choice", prompt);
        Assert.Equal("Bearer sk-test", openAi.LastRequest!.Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task Missing_api_key_gives_a_friendly_message()
    {
        var res = await factory.SignedInClient(new FakeSupabase())
            .PostAsJsonAsync("/api/ai/generate", new { text = Text, multipleChoice = 2, typeIn = 0, flashcards = 0 });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Contains("isn't set up", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Daily_limit_stops_runaway_spending()
    {
        var openAi = Replying(new { questions = Array.Empty<object>(), flashcards = Array.Empty<object>() });
        var client = factory.SignedInClient(new FakeSupabase(), openAi, aiDailyLimit: 2);
        var body = new { text = Text, multipleChoice = 1, typeIn = 0, flashcards = 0 };

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/ai/generate", body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/ai/generate", body)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/ai/generate", body)).StatusCode);
    }

    [Fact]
    public async Task OpenAI_errors_dont_leak_details()
    {
        var openAi = new FakeOpenAi("""{"error":{"message":"secret internal detail"}}""", HttpStatusCode.Unauthorized);
        var res = await factory.SignedInClient(new FakeSupabase(), openAi)
            .PostAsJsonAsync("/api/ai/generate", new { text = Text, multipleChoice = 1, typeIn = 0, flashcards = 0 });

        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
        var body = await res.Content.ReadAsStringAsync();
        Assert.Contains("rejected the API key", body);
        Assert.DoesNotContain("secret internal detail", body);
    }

    [Fact]
    public async Task Saving_writes_questions_and_flashcards_into_the_chapter()
    {
        var supabase = new FakeSupabase().On("quiz_questions", "[{}]", HttpMethod.Post).On("flashcards", "[{}]", HttpMethod.Post);

        var res = await factory.SignedInClient(supabase).PostAsJsonAsync("/api/ai/save", new
        {
            classId = "1",
            chapterId = "3",
            questions = new object[]
            {
                new { question = "Q?", type = "multiple_choice", choices = new[] { "A", "B" }, correctAnswer = "A" },
                new { question = "Typed?", type = "type_in", choices = Array.Empty<string>(), correctAnswer = "42" },
                new { question = "Edited badly?", type = "multiple_choice", choices = new[] { "A", "B" }, correctAnswer = "nope" },
            },
            flashcards = new[] { new { term = "T", definition = "D" } },
        });

        var result = await res.Content.ReadFromJsonAsync<SaveDraftsResult>(JsonSerializerOptions.Web);
        Assert.Equal(new SaveDraftsResult(2, 1), result);

        using var questions = JsonDocument.Parse(supabase.Calls.Single(c => c.Request.RequestUri!.AbsolutePath.EndsWith("/quiz_questions")).Body!);
        var typed = questions.RootElement[1];
        Assert.Equal("type_in", typed.GetProperty("question_type").GetString());
        Assert.True(typed.GetProperty("is_math").GetBoolean());
        Assert.Equal("3", typed.GetProperty("chapter_id").GetString());
        // Saved as the player (their token), so RLS checks the class is theirs.
        Assert.Equal("Bearer test-token", supabase.Calls[0].Request.Headers.Authorization!.ToString());
    }
}

/// <summary>Stands in for OpenAI's API and records the request.</summary>
public sealed class FakeOpenAi(string json, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
{
    public HttpRequestMessage? LastRequest { get; private set; }
    public string? LastBody { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        LastRequest = request;
        LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
        return new HttpResponseMessage(status) { Content = new StringContent(json) };
    }
}
