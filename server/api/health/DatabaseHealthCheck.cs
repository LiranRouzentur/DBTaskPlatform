using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Api.Health;

// Readiness probe. Tagged "ready" — /health/ready returns 503 on SQL failure; /health and
// /health/live are liveness-only and always succeed.
public sealed class DatabaseHealthCheck(IDbContextFactory<AppDbContext> contextFactory) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
            var canConnect = await db.Database.CanConnectAsync(cancellationToken);
            return canConnect
                ? HealthCheckResult.Healthy("Database reachable.")
                : HealthCheckResult.Unhealthy("Database CanConnectAsync returned false.");
        }
        catch (Exception ex)
        {
            
            return HealthCheckResult.Unhealthy(
                $"Database probe failed with {ex.GetType().Name}.",
                ex);
        }
    }
}
