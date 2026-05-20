using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace TaskPlatform.Api.ExceptionHandlers;

// Chain step 3 (catch-all). Client-disconnect OperationCanceledException logs at Debug; real
// failures log Error and return 500 ProblemDetails with a trimmed stack trace.
public sealed class GlobalExceptionHandler(
    // ASP.NET Core writer that emits problem+json with content negotiation.
    IProblemDetailsService problemDetails,
    // Hosting environment — currently unused at runtime but retained for future env-gated detail.
    IHostEnvironment environment,
    // Structured logger; client-disconnects log Debug, real failures log Error with full stack.
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    // Always returns true — this is the last handler in the chain, so any exception that
    // reaches here is converted to 500 ProblemDetails. Client disconnects are swallowed silently.
    public async ValueTask<bool> TryHandleAsync(
        // Current request context — used to read method/path and write the response.
        HttpContext httpContext,
        // The unhandled exception; could be anything not caught by the earlier specific handlers.
        Exception exception,
        // Aborts the problem-details write if the response stream is cancelled mid-flight.
        CancellationToken cancellationToken)
    {

        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            logger.LogDebug("Request cancelled by client on {Method} {Path}",
                httpContext.Request.Method, httpContext.Request.Path);
            return true;
        }

        logger.LogError(
            exception,
            "Unhandled exception on {Method} {Path}",
            httpContext.Request.Method,
            httpContext.Request.Path);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        // ProblemDetailsContext carrying the 500 response body; the Extensions block below
        // adds a trimmed exception payload so the client can correlate via traceId.
        var problem = new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails =
            {
                Type = ProblemTypes.Internal,
                Title = "An unexpected error occurred.",
                Status = StatusCodes.Status500InternalServerError,
                Detail = exception.Message
            }
        };


            problem.ProblemDetails.Extensions["exception"] = new
            {
                Type = exception.GetType().FullName,
                exception.Message,

                StackTrace = exception.StackTrace?.Split(Environment.NewLine).Take(20).ToArray()
            };


        await problemDetails.TryWriteAsync(problem);
        return true;
    }
}
