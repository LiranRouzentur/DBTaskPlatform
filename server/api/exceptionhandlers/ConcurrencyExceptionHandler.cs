using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace TaskPlatform.Api.ExceptionHandlers;

// Chain step 1. Maps DbUpdateConcurrencyException (RowVersion mismatch) to 409 + the
// "concurrent-modification" rule, which the client's store auto-recovers by refetching the list.
public sealed class ConcurrencyExceptionHandler(
    // ASP.NET Core writer that emits problem+json with content negotiation.
    IProblemDetailsService problemDetails,
    // Structured logger for the warning event (concurrent-modification is recoverable, not error).
    ILogger<ConcurrencyExceptionHandler> logger) : IExceptionHandler
{
    // Returns true only for DbUpdateConcurrencyException; any other exception falls through to
    // the next handler in the chain (DbUpdateExceptionHandler → GlobalExceptionHandler).
    public async ValueTask<bool> TryHandleAsync(
        // Current request context — used to read method/path for the log line and write the response.
        HttpContext httpContext,
        // The unhandled exception; we only handle DbUpdateConcurrencyException here.
        Exception exception,
        // Aborts the problem-details write if the response stream is cancelled mid-flight.
        CancellationToken cancellationToken)
    {
        if (exception is not DbUpdateConcurrencyException)
        {
            return false;
        }

        logger.LogWarning(
            "Concurrent modification detected on {Method} {Path}",
            httpContext.Request.Method,
            httpContext.Request.Path);

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails =
            {
                Type = ProblemTypes.Workflow,
                Title = "Task was modified by another request.",
                Status = StatusCodes.Status409Conflict,
                Extensions = { ["rule"] = "concurrent-modification" }
            }
        });
    }
}
