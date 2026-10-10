using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PrettySmart.Api.Ai;

public sealed record GenerateRequest(string? Text, int MultipleChoice, int TypeIn, int Flashcards);

/// <summary>A drafted quiz question. <c>Type</c> is "multiple_choice" or "type_in".</summary>
public sealed record DraftQuestion(string Question, string Type, IReadOnlyList<string> Choices, string CorrectAnswer);

public sealed record DraftFlashcard(string Term, string Definition);

public sealed record StudyDrafts(IReadOnlyList<DraftQuestion> Questions, IReadOnlyList<DraftFlashcard> Flashcards);

/// <summary>Turns pasted text into draft quiz questions and flashcards, and cleans up what the AI returns.</summary>
public sealed class StudyGenerator(OpenAiClient ai)
{
    public const int MaxTextLength = 60_000;  // roughly 15k words — plenty for a chapter
    public const int MaxPerType = 30;

    private const string SystemPrompt = """
        You are a study assistant for a college student. Create study material ONLY from the text provided.
        Never add facts that the text doesn't support.

        Multiple-choice questions: 4 choices (3 is fine if a 4th would be silly), exactly one correct,
        with plausible wrong answers. "correctAnswer" must be copied exactly from "choices".
        Type-in questions: the answer must be short and exact (a term, name, number or 1–4 words),
        and "choices" must be an empty list.
        Flashcards: a key term or concept and a concise definition or explanation from the text.
        Cover the most important ideas, avoid near-duplicate items, and keep wording clear.
        """;

    private static readonly object Schema = new
    {
        type = "object",
        additionalProperties = false,
        required = new[] { "questions", "flashcards" },
        properties = new
        {
            questions = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    additionalProperties = false,
                    required = new[] { "question", "type", "choices", "correctAnswer" },
                    properties = new
                    {
                        question = new { type = "string" },
                        type = new { type = "string", @enum = new[] { "multiple_choice", "type_in" } },
                        choices = new { type = "array", items = new { type = "string" } },
                        correctAnswer = new { type = "string" },
                    },
                },
            },
            flashcards = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    additionalProperties = false,
                    required = new[] { "term", "definition" },
                    properties = new
                    {
                        term = new { type = "string" },
                        definition = new { type = "string" },
                    },
                },
            },
        },
    };

    /// <summary>Returns a readable problem with the request, or null if it's fine.</summary>
    public static string? Validate(GenerateRequest req)
    {
        var text = req.Text?.Trim() ?? "";
        if (text.Length < 50) return "Paste at least a paragraph of text.";
        if (text.Length > MaxTextLength) return $"That's too long — paste up to {MaxTextLength:N0} characters at a time.";
        if (req.MultipleChoice is < 0 or > MaxPerType || req.TypeIn is < 0 or > MaxPerType || req.Flashcards is < 0 or > MaxPerType)
            return $"Pick between 0 and {MaxPerType} of each.";
        if (req.MultipleChoice + req.TypeIn + req.Flashcards == 0) return "Pick how many of something to make.";
        return null;
    }

    public async Task<StudyDrafts> GenerateAsync(GenerateRequest req, CancellationToken ct)
    {
        var prompt = $"""
            Make exactly {req.MultipleChoice} multiple-choice questions, {req.TypeIn} type-in questions,
            and {req.Flashcards} flashcards from this text:

            <text>
            {req.Text!.Trim()}
            </text>
            """;

        using var json = await ai.CompleteJsonAsync(SystemPrompt, prompt, "study_material", Schema, ct);
        var raw = json.Deserialize<StudyDrafts>(JsonSerializerOptions.Web)
            ?? throw new AiException(502, "The AI's answer couldn't be read.");
        return Clean(raw, req);
    }

    /// <summary>
    /// Fixes or drops anything that would break the quiz: blank fields, multiple-choice answers that aren't one of
    /// the choices, duplicate questions/terms, and more items than were asked for.
    /// </summary>
    public static StudyDrafts Clean(StudyDrafts raw, GenerateRequest req)
    {
        static string Tidy(string? s) => (s ?? "").Trim();
        var seenQuestions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var questions = new List<DraftQuestion>();

        foreach (var q in raw.Questions ?? [])
        {
            var text = Tidy(q.Question);
            var answer = Tidy(q.CorrectAnswer);
            if (text.Length == 0 || answer.Length == 0 || !seenQuestions.Add(text)) continue;

            if (q.Type == "multiple_choice")
            {
                var choices = (q.Choices ?? []).Select(Tidy).Where(c => c.Length > 0)
                    .Distinct(StringComparer.OrdinalIgnoreCase).Take(4).ToList();
                var match = choices.FirstOrDefault(c => string.Equals(c, answer, StringComparison.OrdinalIgnoreCase));
                if (choices.Count < 2 || match is null) continue;
                questions.Add(new DraftQuestion(text, "multiple_choice", choices, match));
            }
            else if (q.Type == "type_in")
            {
                questions.Add(new DraftQuestion(text, "type_in", [], answer));
            }
        }

        var trimmed = questions.Where(q => q.Type == "multiple_choice").Take(req.MultipleChoice)
            .Concat(questions.Where(q => q.Type == "type_in").Take(req.TypeIn))
            .ToList();

        var seenTerms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var flashcards = (raw.Flashcards ?? [])
            .Select(f => new DraftFlashcard(Tidy(f.Term), Tidy(f.Definition)))
            .Where(f => f.Term.Length > 0 && f.Definition.Length > 0 && seenTerms.Add(f.Term))
            .Take(req.Flashcards)
            .ToList();

        return new StudyDrafts(trimmed, flashcards);
    }
}

/// <summary>Spending guard: counts generations per player per day (resets when the server restarts).</summary>
public sealed class AiUsageLimiter(IOptions<OpenAiOptions> options, TimeProvider clock)
{
    private readonly ConcurrentDictionary<(string User, DateOnly Day), int> _counts = new();

    public int Limit => options.Value.DailyLimit;

    /// <summary>Uses one generation if the player has any left today.</summary>
    public bool TryUse(string userId)
    {
        var key = (userId, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime));
        var allowed = true;
        _counts.AddOrUpdate(key, 1, (_, n) =>
        {
            if (n >= Limit) { allowed = false; return n; }
            return n + 1;
        });
        return allowed;
    }
}
