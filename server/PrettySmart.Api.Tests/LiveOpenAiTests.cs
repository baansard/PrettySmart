using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using PrettySmart.Api.Ai;

namespace PrettySmart.Api.Tests;

/// <summary>
/// Calls the real OpenAI API with a tiny paragraph (costs well under a cent). Does nothing unless
/// OPENAI_LIVE=1 is set, so normal test runs and CI never spend money. Uses the key from user-secrets.
///   OPENAI_LIVE=1 dotnet test --filter LiveOpenAi
/// </summary>
public class LiveOpenAiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task LiveOpenAi_generates_valid_drafts()
    {
        if (Environment.GetEnvironmentVariable("OPENAI_LIVE") != "1") return;

        using var scope = factory.Services.CreateScope();
        var generator = scope.ServiceProvider.GetRequiredService<StudyGenerator>();

        var drafts = await generator.GenerateAsync(new GenerateRequest(
            """
            A primary key is a column, or set of columns, that uniquely identifies each row in a table.
            A foreign key is a column that refers to the primary key of another table, linking the two tables.
            Normalization organizes tables to reduce redundancy; third normal form (3NF) removes transitive dependencies.
            """, MultipleChoice: 2, TypeIn: 1, Flashcards: 2), CancellationToken.None);

        Assert.Equal(2, drafts.Questions.Count(q => q.Type == "multiple_choice"));
        Assert.Single(drafts.Questions, q => q.Type == "type_in");
        Assert.Equal(2, drafts.Flashcards.Count);
        Assert.All(drafts.Questions.Where(q => q.Type == "multiple_choice"), q => Assert.Contains(q.CorrectAnswer, q.Choices));

        foreach (var q in drafts.Questions) Console.WriteLine($"Q [{q.Type}] {q.Question} → {q.CorrectAnswer}");
        foreach (var f in drafts.Flashcards) Console.WriteLine($"F {f.Term}: {f.Definition}");
    }

    [Fact]
    public async Task LiveOpenAi_auto_mode_picks_its_own_amounts()
    {
        if (Environment.GetEnvironmentVariable("OPENAI_LIVE") != "1") return;

        using var scope = factory.Services.CreateScope();
        var generator = scope.ServiceProvider.GetRequiredService<StudyGenerator>();

        var drafts = await generator.GenerateAsync(new GenerateRequest(
            """
            Return on investment (ROI) measures the profit of an investment relative to its cost:
            ROI = (gain - cost) / cost. Net present value (NPV) discounts future cash flows to today using a
            discount rate; a project with a positive NPV adds value. The internal rate of return (IRR) is the
            discount rate at which NPV equals zero. Payback period is how long it takes to recover the initial cost,
            but it ignores the time value of money.
            """, 0, 0, 0, Auto: true), CancellationToken.None);

        Assert.True(drafts.Questions.Count + drafts.Flashcards.Count > 0);
        Console.WriteLine($"AUTO made {drafts.Questions.Count(q => q.Type == "multiple_choice")} MC, " +
            $"{drafts.Questions.Count(q => q.Type == "type_in")} type-in, {drafts.Flashcards.Count} flashcards");
        foreach (var q in drafts.Questions) Console.WriteLine($"Q [{q.Type}] {q.Question} → {q.CorrectAnswer}");
        foreach (var f in drafts.Flashcards) Console.WriteLine($"F {f.Term}: {f.Definition}");
    }
}
