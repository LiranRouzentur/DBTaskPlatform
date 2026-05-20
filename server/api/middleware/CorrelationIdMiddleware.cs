namespace TaskPlatform.Api.Middleware;

// Joins client and server logs for a single request. Reads X-Correlation-Id from the inbound
// request (generates one when absent), pushes it into an ILogger scope so every log line during
// the request — including EF Core's DbCommand logs and the exception-handler chain — carries it,
// and echoes it back in the response so the client can confirm what the server used.
public sealed class CorrelationIdMiddleware(
    // Next middleware in the pipeline; everything downstream runs inside the log scope below.
    RequestDelegate next,
    // Logger used purely to open the BeginScope — no log lines are emitted by this middleware itself.
    ILogger<CorrelationIdMiddleware> logger)
{
    private const string HeaderName = "X-Correlation-Id";

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = ResolveOrGenerate(context.Request);

        // OnStarting fires just before headers flush — safe place to stamp the response header
        // even if downstream middleware also writes headers (response not yet sent).
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        // Message-template form (not a Dictionary) — produces FormattedLogValues whose ToString
        // renders as "CorrelationId:<id>" in the console scope chain. A raw Dictionary scope would
        // render as "System.Collections.Generic.Dictionary`2[…]" because the formatter calls ToString().
        using (logger.BeginScope("CorrelationId:{CorrelationId}", correlationId))
        {
            await next(context);
        }
    }

    private static string ResolveOrGenerate(HttpRequest request)
    {
        if (request.Headers.TryGetValue(HeaderName, out var value))
        {
            var header = value.ToString();
            if (!string.IsNullOrWhiteSpace(header))
            {
                return header;
            }
        }
        return Guid.NewGuid().ToString();
    }
}
