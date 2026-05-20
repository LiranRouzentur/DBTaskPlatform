using Microsoft.AspNetCore.Mvc;
using TaskPlatform.Api.Contracts;
using TaskPlatform.Application.Services;

namespace TaskPlatform.Api.Controllers;

// Returns every task type + statuses + field specs. Drives the client's dynamic form so adding
// a task type requires no Angular code. Synchronous: registry is in-memory.
[ApiController]
[Route("api/task-types")]
public sealed class TaskTypesController(
    // Application-layer service that exposes ITaskTypeRegistry contents as ordered TaskType objects.
    TaskService service) : ControllerBase
{

    // GET /api/task-types — returns every task type along with its statuses and field specs,
    // sorted alphabetically by name. The Angular client uses this to build the dynamic form.
    [HttpGet]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadList))]
    [ProducesResponseType(typeof(IReadOnlyList<TaskTypeMetadataResponse>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<TaskTypeMetadataResponse>> GetAll()
    {
        // Snapshot of registry-cached TaskType definitions; no DB round-trip — the registry
        // preloads at startup and never refreshes.
        var types = service.GetTaskTypes();
        return Ok(types
            .OrderBy(t => t.Name)
            .Select(t => t.ToResponse())
            .ToList());
    }
}
