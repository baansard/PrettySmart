using System.Security.Claims;
using PrettySmart.Api.Models;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Endpoints;

public static class ClassEndpoints
{
    public const int MaxNameLength = 60;

    public static RouteGroupBuilder MapClassEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/classes").RequireAuthorization();

        group.MapGet("/", async (SupabaseRest db, CancellationToken ct) =>
            await db.GetAsync<StudyClass>("classes?select=*&order=name", ct));

        group.MapPost("/", async (CreateClassRequest body, ClaimsPrincipal user, SupabaseRest db, CancellationToken ct) =>
        {
            var name = body.Name?.Trim();
            if (string.IsNullOrEmpty(name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Class name is required."] });
            if (name.Length > MaxNameLength)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = [$"Class name must be {MaxNameLength} characters or fewer."] });

            // The owner always comes from the verified token, never from the request body.
            var created = await db.InsertAsync<StudyClass>("classes", new { name, user_id = user.UserId() }, ct);
            return Results.Created($"/api/classes/{created.Id}", created);
        });

        group.MapDelete("/{id}", async (string id, SupabaseRest db, CancellationToken ct) =>
        {
            var removed = await db.DeleteAsync($"classes?id=eq.{Uri.EscapeDataString(id)}", ct);
            return removed > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }

    /// <summary>The Supabase user id (the token's <c>sub</c> claim).</summary>
    public static string UserId(this ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub")
        ?? throw new InvalidOperationException("Token has no subject.");
}
