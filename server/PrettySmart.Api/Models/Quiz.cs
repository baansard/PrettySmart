using System.Text.Json.Serialization;

namespace PrettySmart.Api.Models;

// ── Rows as stored in Supabase ──────────────────────────────────────────────

public sealed record ChapterRow(
    [property: JsonConverter(typeof(FlexibleIdConverter))] string Id,
    string Title);

public sealed record QuestionRow(
    [property: JsonConverter(typeof(FlexibleIdConverter))] string Id,
    [property: JsonConverter(typeof(FlexibleIdConverter))] string ClassId,
    [property: JsonConverter(typeof(FlexibleIdConverter))] string? ChapterId,
    string Question,
    string? QuestionType,
    bool IsMath,
    List<string>? Choices,
    string CorrectAnswer);

public sealed record AnswerRow(bool IsCorrect);

// ── What the API sends to / receives from the game ──────────────────────────

/// <summary>A chapter in the quiz picker. <c>ChapterId</c> is null for questions with no chapter.</summary>
public sealed record QuizChapter(
    string? ChapterId,
    string Title,
    int QuestionCount,
    int RecentAnswered,
    int? RecentPercent);

/// <summary>A question as the player sees it — the correct answer is never included.</summary>
public sealed record QuizQuestion(string Id, string Question, bool IsTypeIn, List<string> Choices);

public sealed record SubmitAnswerRequest(string? QuestionId, string? Answer);

public sealed record AnswerResult(bool Correct, string CorrectAnswer, int PointsEarned, int TotalPoints);

public sealed record PointsResult(int Points);
