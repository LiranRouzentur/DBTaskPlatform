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
    public static (int StatusCode, ProblemDetails Problem) Map(WorkflowError error)
    {
        var (status, type, title) = Classify(error);

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

    private static (int Status, string Type, string Title) Classify(WorkflowError error) => error switch
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

    public static async Task<IActionResult> ToActionResult(
        this ControllerBase controller,
        WorkflowError error)
    {
        var (status, problem) = Map(error);

        var http = controller.HttpContext;
        http.Response.StatusCode = status;

        var problemDetailsService = http.RequestServices.GetRequiredService<IProblemDetailsService>();
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

    public static async Task<IActionResult> ToActionResult<T>(
        this ControllerBase controller,
        Application.Workflow.WorkflowOutcome<T> outcome,
        Func<T, IActionResult> onSuccess)
        where T : class
        => outcome.IsFailure
            ? await controller.ToActionResult(outcome.Error!)
            : onSuccess(outcome.Value!);
}
