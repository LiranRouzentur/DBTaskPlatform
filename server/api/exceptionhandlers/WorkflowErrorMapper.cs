using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using TaskPlatform.Domain.Errors;

namespace TaskPlatform.Api.ExceptionHandlers;

// Bridges WorkflowError → RFC 7807 ProblemDetails. Status-code mapping kept here (not on the
// errors) so the domain stays HTTP-agnostic. Status mapping: 400=validation/unknown,
// 404=TaskNotFound, 409=workflow conflicts, 422=InvalidData (field errors in Extensions["errors"]).
public static class WorkflowErrorMapper
{
    // Converts a domain WorkflowError into the (status, ProblemDetails) pair the API writes.
    // The kebab-case `rule` extension is the contract surface the Angular WorkflowRule union mirrors.
    public static (int StatusCode, ProblemDetails Problem) Map(
        // Domain error returned by WorkflowOutcome.Fail — never an unexpected exception.
        WorkflowError error)
    {
        // Tuple destructure of the per-arm classification: HTTP status + Type URI + Title.
        var (status, type, title) = Classify(error);

        // RFC 7807 ProblemDetails body; Detail carries the human-readable domain error message.
        var problem = new ProblemDetails
        {
            Type = type,
            Title = title,
            Status = status,
            Detail = error.Message,
        };

        problem.Extensions["rule"] = error.Rule;

        if (error is WorkflowError.InvalidData invalid)
        {
            problem.Extensions["errors"] = invalid.Errors;
        }

        return (status, problem);
    }

    // Per-arm classification of WorkflowError → (status, Type URI, Title). The `_` arm THROWS
    // on purpose so adding a new error arm without updating this switch fails loud during dev.
    private static (int Status, string Type, string Title) Classify(
        // Discriminated WorkflowError record — every concrete arm must be handled.
        WorkflowError error) => error switch
    {
        WorkflowError.TaskNotFound =>
            (StatusCodes.Status404NotFound, ProblemTypes.NotFound, "Task not found."),

        WorkflowError.UnknownTaskType =>
            (StatusCodes.Status400BadRequest, ProblemTypes.Validation, "Unknown task type."),

        WorkflowError.UnknownUser =>
            (StatusCodes.Status400BadRequest, ProblemTypes.Validation, "Unknown user."),

        WorkflowError.InvalidNextUser =>
            (StatusCodes.Status400BadRequest, ProblemTypes.Validation, "Next assigned user is missing."),

        WorkflowError.NoMovement =>
            (StatusCodes.Status400BadRequest, ProblemTypes.Workflow, "Target status equals current status."),

        WorkflowError.InvalidStatus =>
            (StatusCodes.Status400BadRequest, ProblemTypes.Validation, "Invalid status."),

        WorkflowError.InvalidData =>
            (StatusCodes.Status422UnprocessableEntity, ProblemTypes.Validation, "Status data is invalid."),

        WorkflowError.ClosedImmutable or
        WorkflowError.AlreadyClosed =>
            (StatusCodes.Status409Conflict, ProblemTypes.Workflow, "Closed tasks are immutable."),

        WorkflowError.NoForwardSkip =>
            (StatusCodes.Status409Conflict, ProblemTypes.Workflow, "Forward moves must be sequential."),

        WorkflowError.BeyondFinal =>
            (StatusCodes.Status409Conflict, ProblemTypes.Workflow, "Status is beyond the final status."),

        WorkflowError.NotAtFinal =>
            (StatusCodes.Status409Conflict, ProblemTypes.Workflow, "Task can only be closed at the final status."),

        // Fallback throws on purpose so new WorkflowError arms can't be silently mishandled.
        _ => throw new InvalidOperationException(
            $"WorkflowErrorMapper is missing an arm for {error.GetType().FullName}."),
    };

    // Extension that writes the ProblemDetails directly through IProblemDetailsService so the
    // standard problem+json content negotiation runs. Falls back to StatusCode(...) if no writer matched.
    public static async Task<IActionResult> ToActionResult(
        // The controller invoking the helper — used to grab HttpContext + RequestServices.
        this ControllerBase controller,
        // Domain error to surface as ProblemDetails.
        WorkflowError error)
    {
        // Tuple of resolved HTTP status + populated ProblemDetails body.
        var (status, problem) = Map(error);

        // Current HTTP context; needed to set the status code and locate IProblemDetailsService.
        var http = controller.HttpContext;
        http.Response.StatusCode = status;

        // Resolved problem-details writer — registered in Program.cs via AddProblemDetails(...).
        var problemDetailsService = http.RequestServices.GetRequiredService<IProblemDetailsService>();
        // Whether the writer accepted the request — false only if no content-negotiated formatter matched.
        var wrote = await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = problem,
        });

        if (wrote)
        {

            return new EmptyResult();
        }

        return controller.StatusCode(status, problem);
    }

    // Generic overload used by controllers: pass a WorkflowOutcome<T> + success projection and
    // get the right ActionResult either way. Keeps controller actions to a single expression.
    public static async Task<IActionResult> ToActionResult<T>(
        // The controller invoking the helper — forwarded to the single-arg ToActionResult on failure.
        this ControllerBase controller,
        // Outcome returned by TaskService — either a domain Error or a Value to project.
        Application.Workflow.WorkflowOutcome<T> outcome,
        // Success projection — typically Ok(...) or CreatedAtAction(...) wrapping the DTO.
        Func<T, IActionResult> onSuccess)
        where T : class
        => outcome.IsFailure
            ? await controller.ToActionResult(outcome.Error!)
            : onSuccess(outcome.Value!);
}
