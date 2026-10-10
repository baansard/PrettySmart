using System.Security.Claims;
using PrettySmart.Api.Endpoints;
using PrettySmart.Api.Supabase;

namespace PrettySmart.Api.Shop;

/// <summary>Coin balance = points earned from quizzes − coins spent. Calculated by the database.</summary>
public static class Wallet
{
    public static Task<int> BalanceAsync(SupabaseAdmin admin, ClaimsPrincipal user, CancellationToken ct) =>
        admin.RpcAsync<int>("coin_balance", new { p_user = user.UserId() }, ct);
}
