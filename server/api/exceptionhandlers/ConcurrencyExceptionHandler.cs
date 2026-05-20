using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace TaskPlatform.Api.ExceptionHandlers;

// Chain step 1. Maps DbUpdateConcurrencyException (RowVersion mismatch) to 409 + the
// "concurrent-modification" rule, which the client's store auto-recovers by refetching the list.
public sealed class ConcurrencyExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<ConcurrencyExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
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
