using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.FileProviders;
using PrettySmart.Api.Endpoints;
using PrettySmart.Api.Supabase;

var builder = WebApplication.CreateBuilder(args);

var supabase = builder.Configuration.GetSection(SupabaseOptions.Section).Get<SupabaseOptions>()
    ?? throw new InvalidOperationException("Missing \"Supabase\" settings in appsettings.json.");
builder.Services.AddOptions<SupabaseOptions>().BindConfiguration(SupabaseOptions.Section);

// Verify Supabase access tokens using the project's public signing keys (fetched via OpenID discovery).
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = supabase.AuthIssuer;
        o.TokenValidationParameters.ValidAudience = "authenticated";
        o.MapInboundClaims = false; // keep "sub" as "sub"
    });
builder.Services.AddAuthorization();

builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient<SupabaseRest>();
builder.Services.AddProblemDetails();

var app = builder.Build();

// Turn Supabase errors into clean API responses instead of 500s.
app.UseExceptionHandler(errors => errors.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    var (status, title) = ex is SupabaseException se
        ? (se.Status is 401 or 403 ? se.Status : StatusCodes.Status502BadGateway, "Database request failed")
        : (StatusCodes.Status500InternalServerError, "Unexpected server error");
    if (ex is not null) app.Logger.LogError(ex, "{Title}", title);
    await Results.Problem(title: title, statusCode: status).ExecuteAsync(ctx);
}));

// Serve the browser game (index.html, style.css, js/, assets/) from the repo root.
// Only those paths are exposed, so server code and .git stay private.
var gameRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, app.Configuration["GameRoot"] ?? "../.."));
var game = new PhysicalFileProvider(gameRoot);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = game });
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "/";
    var allowed = path is "/" or "/index.html" or "/style.css"
        || path.StartsWith("/js/") || path.StartsWith("/assets/") || path.StartsWith("/api/");
    if (!allowed) { ctx.Response.StatusCode = StatusCodes.Status404NotFound; return; }
    await next();
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = game,
    OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-store", // always pick up edits
});

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapClassEndpoints();
app.MapQuizEndpoints();

app.Run();

public partial class Program; // lets integration tests reference the app
