using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace TaskPlatform.Api.Contracts;

// Feeds OpenAPI with the full ProblemDetails error-status set without polluting controllers.
// Flows: ReadList/ReadById (reads), Create (POST + 422), WorkflowWrite (mutations + 404/409/422).
public static class WorkflowApiConventions
{
    // List endpoints. Only the catch-all 500 is documented — 200 is added by the action itself.
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
    public static void ReadList() { }

    // Single-resource GETs. 404 is the only domain-error response; 500 is the catch-all.
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
    public static void ReadById() { }

    // POST-create endpoints. 400 for bad request shape, 422 for field-level validation, 500 catch-all.
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(HttpValidationProblemDetails), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
    public static void Create() { }

    // Mutation endpoints (status change, step update, close). Carries the full ProblemDetails
    // matrix: 400 (validation), 404 (missing task), 409 (workflow conflict / concurrency),
    // 422 (custom-data field errors), 500 catch-all.
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(HttpValidationProblemDetails), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
    public static void WorkflowWrite() { }
}
