using System.Globalization;
using System.Text.RegularExpressions;

namespace PrettySmart.Api.Quiz;

/// <summary>Decides whether a submitted answer is correct. Pure logic, no I/O.</summary>
public static partial class QuizGrader
{
    public const int PointsPerCorrect = 10;

    public static bool IsCorrect(string? submitted, string correct, bool isMath)
    {
        var a = Normalize(submitted);
        var b = Normalize(correct);
        if (a.Length == 0) return false;
        if (a == b) return true;

        // Type-in math: "1,000", "$1000" and "1000.0" all equal 1000.
        return isMath && TryNumber(a, out var x) && TryNumber(b, out var y)
            && Math.Abs(x - y) <= Math.Max(1e-9, Math.Abs(y) * 1e-6);
    }

    /// <summary>Case-insensitive, trimmed, inner whitespace collapsed.</summary>
    private static string Normalize(string? s) =>
        Whitespace().Replace((s ?? "").Trim(), " ").ToLowerInvariant();

    private static bool TryNumber(string s, out double value) =>
        double.TryParse(s.Replace("$", "").Replace(",", "").Replace("%", "").Replace(" ", ""),
            NumberStyles.Float, CultureInfo.InvariantCulture, out value);

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
