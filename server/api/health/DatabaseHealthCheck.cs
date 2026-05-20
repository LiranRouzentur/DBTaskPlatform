using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Api.Health;

// Readiness probe. Tagged "ready" — /health/ready returns 503 on SQL failure; /health and
// /health/live are liveness-only and always succeed.
public sealed class DatabaseHealthCheck(
    // Singleton factory used to create a short-lived AppDbContext per probe — no request scope here.
    IDbContextFactory<AppDbContext> contextFactory) : IHealthCheck
{
    // Builds a transient DbContext and asks SQL Server "can you connect?". Any exception is
    // captured and surfaced as Unhealthy with the exception type for ops visibility.
    public async Task<HealthCheckResult> CheckHealthAsync(
        // Provided by the health-check framework; not consulted here because the probe is generic.
        HealthCheckContext context,
        // Aborts the SQL round-trip if the probe is itself cancelled.
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Transient AppDbContext used purely for the connect probe; disposed at scope exit.
            await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
            // Result of EF's lightweight connectivity test — does not run any user query.
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
