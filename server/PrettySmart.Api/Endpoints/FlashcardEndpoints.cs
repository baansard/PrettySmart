using System.Text.Json.Serialization;
using PrettySmart.Api.Models;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Endpoints;

public sealed record FlashcardRow(
    [property: JsonConverter(typeof(FlexibleIdConverter))] string Id,
    [property: JsonConverter(typeof(FlexibleIdConverter))] string? ChapterId,
    string Term, string Definition);

/// <summary>A chapter in the flashcard picker. <c>ChapterId</c> is null for cards with no chapter.</summary>
public sealed record FlashcardChapter(string? ChapterId, string Title, int Count);

public sealed record Flashcard(string Id, string Term, string Definition);

public static class FlashcardEndpoints
{
    public static void MapFlashcardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/flashcards").RequireAuthorization();

        // Chapters that have flashcards, with how many each (read as the player, so RLS applies).
        group.MapGet("/chapters", async (string classId, SupabaseRest db, CancellationToken ct) =>
        {
            var cls = Uri.EscapeDataString(classId);
            var chaptersTask = db.GetAsync<ChapterRow>($"chapters?select=id,title&class_id=eq.{cls}&order=id", ct);
            var cardsTask = db.GetAsync<FlashcardRow>($"flashcards?select=id,chapter_id,term,definition&class_id=eq.{cls}", ct);
            await Task.WhenAll(chaptersTask, cardsTask);

            var counts = cardsTask.Result.GroupBy(c => c.ChapterId ?? QuizEndpoints.NoChapter).ToDictionary(g => g.Key, g => g.Count());
            var result = chaptersTask.Result
                .Select(c => new FlashcardChapter(c.Id, c.Title, counts.GetValueOrDefault(c.Id)))
                .ToList();
            if (counts.TryGetValue(QuizEndpoints.NoChapter, out var loose))
                result.Add(new FlashcardChapter(null, "No chapter", loose));
            return result;
        });

        // The cards in one chapter, in the order they were added.
        group.MapGet("/", async (string classId, string? chapterId, SupabaseRest db, CancellationToken ct) =>
        {
            var filter = string.IsNullOrEmpty(chapterId) || chapterId == QuizEndpoints.NoChapter
                ? "chapter_id=is.null"
                : $"chapter_id=eq.{Uri.EscapeDataString(chapterId)}";
            var rows = await db.GetAsync<FlashcardRow>(
                $"flashcards?select=id,chapter_id,term,definition&class_id=eq.{Uri.EscapeDataString(classId)}&{filter}&order=id", ct);
            return rows.Select(r => new Flashcard(r.Id, r.Term, r.Definition)).ToList();
        });
    }
}
