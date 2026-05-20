using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace TaskPlatform.Api.ExceptionHandlers;

// Chain step 2. Maps SQL Server error numbers to ProblemDetails so raw SqlException messages
// never leak: 547 (FK) → 400, 2601/2627 (unique index) → 409.
public sealed class DbUpdateExceptionHandler(
    // ASP.NET Core writer that emits problem+json with content negotiation.
    IProblemDetailsService problemDetails,
    // Structured logger; warnings are emitted at request scope with rule + sql number.
    ILogger<DbUpdateExceptionHandler> logger) : IExceptionHandler
{
    // Returns true only when the inner exception is a recognized SqlException error number;
    // unknown numbers fall through to the catch-all GlobalExceptionHandler.
    public async ValueTask<bool> TryHandleAsync(
        // Current request context — used to read method/path and write the response.
        HttpContext httpContext,
        // The unhandled exception; we only handle DbUpdateException with a SqlException inner.
        Exception exception,
        // Aborts the problem-details write if the response stream is cancelled mid-flight.
        CancellationToken cancellationToken)
    {
        if (exception is not DbUpdateException dbEx) return false;
        if (dbEx.InnerException is not SqlException sql) return false;

        // Four-tuple destructure: HTTP status + Type URI + Title + kebab-case rule. The 0/empty
        // tuple is the sentinel signalling "not one of the known sql error numbers — fall through".
        var (status, type, title, rule) = sql.Number switch
        {
            547 =>
                (StatusCodes.Status400BadRequest, ProblemTypes.Validation,
                 "Referenced entity was not found.", "foreign-key-violation"),

            2601 or 2627 =>
                (StatusCodes.Status409Conflict, ProblemTypes.Workflow,
                 "A conflicting record already exists.", "constraint-violation"),

            _ => (0, "", "", ""),
        };

        if (status == 0) return false;

        logger.LogWarning(
            "Database constraint rejected request: rule={Rule} sqlNumber={Number} on {Method} {Path}",
            rule, sql.Number, httpContext.Request.Method, httpContext.Request.Path);

        httpContext.Response.StatusCode = status;
        await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails =
            {
                Type = type,
                Title = title,
                Status = status,
                Extensions = { ["rule"] = rule },
            },
        });
        return true;
    }
}
