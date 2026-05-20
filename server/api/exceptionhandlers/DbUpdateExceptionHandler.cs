using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace TaskPlatform.Api.ExceptionHandlers;

// Chain step 2. Maps SQL Server error numbers to ProblemDetails so raw SqlException messages
// never leak: 547 (FK) → 400, 2601/2627 (unique index) → 409.
public sealed class DbUpdateExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<DbUpdateExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not DbUpdateException dbEx) return false;
        if (dbEx.InnerException is not SqlException sql) return false;

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
