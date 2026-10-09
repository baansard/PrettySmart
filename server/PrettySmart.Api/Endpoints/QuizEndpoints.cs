using System.Security.Claims;
using PrettySmart.Api.Models;
using PrettySmart.Api.Quiz;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Endpoints;

public static class QuizEndpoints
{
    /// <summary>How many recent answers the per-chapter average looks at.</summary>
    public const int RecentWindow = 30;

    /// <summary>Stand-in chapter id for questions that have no chapter.</summary>
    public const string NoChapter = "none";

    public static RouteGroupBuilder MapQuizEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/quiz").RequireAuthorization();

        // Chapters to pick from, each with its question count and last-30 average.
        group.MapGet("/chapters", async (string classId, SupabaseRest db, CancellationToken ct) =>
        {
            var cls = Uri.EscapeDataString(classId);
            var chaptersTask = db.GetAsync<ChapterRow>($"chapters?select=id,title&class_id=eq.{cls}&order=id", ct);
            var questionsTask = db.GetAsync<QuestionRow>($"quiz_questions?select=*&class_id=eq.{cls}", ct);
            await Task.WhenAll(chaptersTask, questionsTask);

            var countByChapter = questionsTask.Result
                .GroupBy(q => q.ChapterId ?? NoChapter)
                .ToDictionary(g => g.Key, g => g.Count());

            var entries = chaptersTask.Result.Select(c => (Id: c.Id, c.Title)).ToList();
            if (countByChapter.ContainsKey(NoChapter)) entries.Add((NoChapter, "No chapter"));

            return await Task.WhenAll(entries.Select(async e =>
            {
                var filter = e.Id == NoChapter
                    ? $"class_id=eq.{cls}&chapter_id=is.null"
                    : $"chapter_id=eq.{Uri.EscapeDataString(e.Id)}";
                var recent = await db.GetAsync<AnswerRow>(
                    $"quiz_answers?select=is_correct&{filter}&order=answered_at.desc&limit={RecentWindow}", ct);
                int? percent = recent.Count == 0 ? null : (int)Math.Round(100.0 * recent.Count(a => a.IsCorrect) / recent.Count);
                return new QuizChapter(e.Id == NoChapter ? null : e.Id, e.Title,
                    countByChapter.GetValueOrDefault(e.Id), recent.Count, percent);
            }));
        });

        // Questions for one chapter, shuffled, with the answers stripped out.
        group.MapGet("/questions", async (string classId, string? chapterId, SupabaseRest db, CancellationToken ct) =>
        {
            var filter = string.IsNullOrEmpty(chapterId) || chapterId == NoChapter
                ? "chapter_id=is.null"
                : $"chapter_id=eq.{Uri.EscapeDataString(chapterId)}";
            var rows = await db.GetAsync<QuestionRow>(
                $"quiz_questions?select=*&class_id=eq.{Uri.EscapeDataString(classId)}&{filter}", ct);

            return rows
                .Select(q => new QuizQuestion(q.Id, q.Question, IsTypeIn(q),
                    IsTypeIn(q) ? [] : [.. (q.Choices ?? []).OrderBy(_ => Random.Shared.Next())]))
                .OrderBy(_ => Random.Shared.Next())
                .ToList();
        });

        // Grade one answer, record it, and award points.
        group.MapPost("/answers", async (SubmitAnswerRequest body, ClaimsPrincipal user, SupabaseRest db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.QuestionId))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["questionId"] = ["Question id is required."] });

            var found = await db.GetAsync<QuestionRow>(
                $"quiz_questions?select=*&id=eq.{Uri.EscapeDataString(body.QuestionId)}", ct);
            if (found is not [var q]) return Results.NotFound();

            var correct = QuizGrader.IsCorrect(body.Answer, q.CorrectAnswer, IsTypeIn(q));
            var earned = correct ? QuizGrader.PointsPerCorrect : 0;

            await db.InsertAsync<AnswerRow>("quiz_answers", new
            {
                user_id = user.UserId(),
                class_id = q.ClassId,
                chapter_id = q.ChapterId,
                question_id = q.Id,
                is_correct = correct,
                points = earned,
            }, ct);

            return Results.Ok(new AnswerResult(correct, q.CorrectAnswer, earned, await TotalPoints(db, ct)));
        });

        group.MapGet("/points", async (SupabaseRest db, CancellationToken ct) =>
            new PointsResult(await TotalPoints(db, ct)));

        return group;
    }

    private static bool IsTypeIn(QuestionRow q) => q.IsMath || q.QuestionType == "type_in";

    private static async Task<int> TotalPoints(SupabaseRest db, CancellationToken ct) =>
        await db.CountAsync("quiz_answers?is_correct=eq.true", ct) * QuizGrader.PointsPerCorrect;
}
