using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace TaskPlatform.Api.ExceptionHandlers;

// Chain step 3 (catch-all). Client-disconnect OperationCanceledException logs at Debug; real
// failures log Error and return 500 ProblemDetails with a trimmed stack trace.
public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetails,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
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
