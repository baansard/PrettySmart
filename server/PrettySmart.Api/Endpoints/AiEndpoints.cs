using System.Security.Claims;
using System.Text.Json;
using PrettySmart.Api.Ai;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Endpoints;

public sealed record SaveDraftsRequest(
    string? ClassId, string? ChapterId,
    IReadOnlyList<DraftQuestion>? Questions, IReadOnlyList<DraftFlashcard>? Flashcards);

public sealed record SaveDraftsResult(int Questions, int Flashcards);

public static class AiEndpoints
{
    public static void MapAiEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ai").RequireAuthorization();

        // Pasted text → draft quiz questions and flashcards (nothing is saved yet).
        group.MapPost("/generate", async (GenerateRequest body, ClaimsPrincipal user, StudyGenerator generator,
            AiUsageLimiter limiter, CancellationToken ct) =>
        {
            if (StudyGenerator.Validate(body) is { } problem)
                return Results.Problem(problem, statusCode: StatusCodes.Status400BadRequest);
            if (!limiter.TryUse(user.UserId()))
                return Results.Problem($"You've used today's {limiter.Limit} AI generations. More tomorrow!",
                    statusCode: StatusCodes.Status429TooManyRequests);

            try
            {
                return Results.Ok(await generator.GenerateAsync(body, ct));
            }
            catch (AiException ex)
            {
                return Results.Problem(ex.Message, statusCode: ex.Status);
            }
        });

        // Save the drafts the player kept (and maybe edited) into a class/chapter.
        group.MapPost("/save", async (SaveDraftsRequest body, SupabaseRest db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.ClassId))
                return Results.Problem("Pick a class to save into.", statusCode: StatusCodes.Status400BadRequest);

            // Same clean-up as generation, in case drafts were edited into something invalid.
            var clean = StudyGenerator.Clean(
                new StudyDrafts(body.Questions ?? [], body.Flashcards ?? []),
                new GenerateRequest(null, int.MaxValue, int.MaxValue, int.MaxValue));
            if (clean.Questions.Count + clean.Flashcards.Count == 0)
                return Results.Problem("Nothing to save — every item was empty or invalid.", statusCode: StatusCodes.Status400BadRequest);

            var chapterId = string.IsNullOrWhiteSpace(body.ChapterId) ? null : body.ChapterId;

            // Saved as the player, so Row Level Security makes sure the class is theirs.
            if (clean.Questions.Count > 0)
                await db.InsertAsync<JsonElement>("quiz_questions", clean.Questions.Select(q => new
                {
                    class_id = body.ClassId,
                    chapter_id = chapterId,
                    question = q.Question,
                    question_type = q.Type,
                    is_math = q.Type == "type_in",
                    choices = q.Type == "multiple_choice" ? q.Choices : null,
                    correct_answer = q.CorrectAnswer,
                }).ToList(), ct);

            if (clean.Flashcards.Count > 0)
                await db.InsertAsync<JsonElement>("flashcards", clean.Flashcards.Select(f => new
                {
                    class_id = body.ClassId,
                    chapter_id = chapterId,
                    term = f.Term,
                    definition = f.Definition,
                }).ToList(), ct);

            return Results.Ok(new SaveDraftsResult(clean.Questions.Count, clean.Flashcards.Count));
        });
    }
}
