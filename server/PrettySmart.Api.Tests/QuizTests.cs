using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using PrettySmart.Api.Endpoints;
using PrettySmart.Api.Models;
using PrettySmart.Api.Quiz;

namespace PrettySmart.Api.Tests;

public class QuizGraderTests
{
    [Theory]
    [InlineData("Accounts Receivable", "accounts receivable", false)]
    [InlineData("  net   income ", "Net Income", false)]
    [InlineData("1,000", "1000", true)]
    [InlineData("$1000.00", "1000", true)]
    [InlineData("0.25", ".25", true)]
    public void Accepts_equivalent_answers(string submitted, string correct, bool isMath) =>
        Assert.True(QuizGrader.IsCorrect(submitted, correct, isMath));

    [Theory]
    [InlineData("", "anything", false)]
    [InlineData(null, "anything", false)]
    [InlineData("1001", "1000", true)]
    [InlineData("1,000", "1000", false)] // number tolerance only applies to math questions
    [InlineData("assets", "liabilities", false)]
    public void Rejects_wrong_answers(string? submitted, string correct, bool isMath) =>
        Assert.False(QuizGrader.IsCorrect(submitted, correct, isMath));
}

public class QuizEndpointsTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Question =
        """[{"id":7,"class_id":1,"chapter_id":3,"question":"2+2?","question_type":"type_in","is_math":true,"choices":null,"correct_answer":"4"}]""";

    [Fact]
    public async Task Questions_never_include_the_answer()
    {
        var supabase = new FakeSupabase().On("quiz_questions",
            """[{"id":7,"class_id":1,"chapter_id":3,"question":"Pick B","question_type":"multiple_choice","is_math":false,"choices":["A","B"],"correct_answer":"B"}]""");

        var res = await factory.SignedInClient(supabase).GetStringAsync("/api/quiz/questions?classId=1&chapterId=3");

        Assert.DoesNotContain("correct", res, StringComparison.OrdinalIgnoreCase);
        var q = Assert.Single(JsonSerializer.Deserialize<List<QuizQuestion>>(res, JsonSerializerOptions.Web)!);
        Assert.False(q.IsTypeIn);
        Assert.Equal(["A", "B"], q.Choices.Order());
    }

    [Fact]
    public async Task Correct_answer_earns_points_and_is_recorded()
    {
        var supabase = new FakeSupabase()
            .On("rpc/coin_balance", "50")
            .On("quiz_answers", """[{"is_correct":true}]""", HttpMethod.Post)
            .On("quiz_questions", Question);

        var result = await (await factory.SignedInClient(supabase)
            .PostAsJsonAsync("/api/quiz/answers", new { questionId = "7", answer = " 4 " }))
            .Content.ReadFromJsonAsync<AnswerResult>();

        Assert.True(result!.Correct);
        Assert.Equal(QuizGrader.PointsPerCorrect, result.PointsEarned);
        Assert.Equal(5 * QuizGrader.PointsPerCorrect, result.TotalPoints);

        var insert = supabase.Calls.Single(c => c.Request.Method == HttpMethod.Post && c.Request.RequestUri!.AbsolutePath.EndsWith("/quiz_answers"));
        Assert.Equal("sb_secret_test", insert.Request.Headers.GetValues("apikey").Single()); // written by the server, not the player
        using var row = JsonDocument.Parse(insert.Body!);
        Assert.Equal("user-1", row.RootElement.GetProperty("user_id").GetString());
        Assert.True(row.RootElement.GetProperty("is_correct").GetBoolean());
        Assert.Equal("3", row.RootElement.GetProperty("chapter_id").GetString());
    }

    [Fact]
    public async Task Wrong_answer_earns_nothing_and_reveals_the_answer()
    {
        var supabase = new FakeSupabase()
            .On("rpc/coin_balance", "0")
            .On("quiz_answers", """[{"is_correct":false}]""", HttpMethod.Post)
            .On("quiz_questions", Question);

        var result = await (await factory.SignedInClient(supabase)
            .PostAsJsonAsync("/api/quiz/answers", new { questionId = "7", answer = "5" }))
            .Content.ReadFromJsonAsync<AnswerResult>();

        Assert.False(result!.Correct);
        Assert.Equal(0, result.PointsEarned);
        Assert.Equal("4", result.CorrectAnswer);
    }

    [Fact]
    public async Task Answering_an_unknown_question_is_404()
    {
        var res = await factory.SignedInClient(new FakeSupabase())
            .PostAsJsonAsync("/api/quiz/answers", new { questionId = "999", answer = "x" });
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Chapters_show_last_30_average()
    {
        // Chapter 3: 3 of the last 4 answers correct → 75%. Chapter 4: never answered.
        var supabase = new FakeSupabase()
            .On("chapter_id=eq.3", """[{"is_correct":true},{"is_correct":true},{"is_correct":false},{"is_correct":true}]""")
            .On("chapter_id=eq.4", "[]")
            .On("chapters?", """[{"id":3,"title":"Ch 1"},{"id":4,"title":"Ch 2"}]""")
            .On("quiz_questions", Question);

        var chapters = await factory.SignedInClient(supabase).GetFromJsonAsync<List<QuizChapter>>("/api/quiz/chapters?classId=1");

        Assert.Collection(chapters!,
            c => { Assert.Equal("Ch 1", c.Title); Assert.Equal(1, c.QuestionCount); Assert.Equal(75, c.RecentPercent); },
            c => { Assert.Equal("Ch 2", c.Title); Assert.Equal(0, c.QuestionCount); Assert.Null(c.RecentPercent); });
        Assert.Contains(supabase.Calls, c => c.Request.RequestUri!.ToString().Contains($"limit={QuizEndpoints.RecentWindow}"));
    }
}
