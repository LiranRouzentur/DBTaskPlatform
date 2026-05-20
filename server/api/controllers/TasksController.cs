using Microsoft.AspNetCore.Mvc;
using TaskPlatform.Api.Contracts;
using TaskPlatform.Api.ExceptionHandlers;
using TaskPlatform.Application.Services;
using TaskPlatform.Application.Workflow;

namespace TaskPlatform.Api.Controllers;

// Intentionally thin: DTO → TaskService → ToActionResult. The /steps endpoint edits prior or
// current-status data in place without moving the task (UX affordance for fixing captured values).

// HTTP controller for the task resource. Owns no logic of its own — every action parses a DTO,
// delegates to TaskService, and converts the returned WorkflowOutcome into an ActionResult.
[ApiController]
[Route("api/tasks")]
public sealed class TasksController(
    // Application-layer service that owns the request-scoped transaction and workflow orchestration.
    TaskService service,
    // Singleton in-memory cache of TaskType / StatusDefinition / StatusFieldSpec used by the
    // ToDetail mapper to enrich responses with field metadata.
    ITaskTypeRegistry registry) : ControllerBase
{

    // GET /api/tasks — returns a filtered list of tasks. All three filters are optional; when all
    // are null the response is the full task list. Maps each entity to the slim TaskListItem DTO.
    [HttpGet]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadList))]
    [ProducesResponseType(typeof(IReadOnlyList<TaskListItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<TaskListItem>>> List(
        // Optional filter: restrict to tasks currently assigned to this user id.
        [FromQuery] int? userId,
        // Optional filter: restrict to tasks of this task-type id.
        [FromQuery] int? taskTypeId,
        // Optional filter: true → closed only, false → open only, null → both.
        [FromQuery] bool? isClosed,
        // Propagated through EF so client disconnects abort the query instead of completing it.
        CancellationToken cancellationToken)
    {
        // Materialized task entities returned by the service, already filtered server-side.
        var tasks = await service.ListAsync(
            new TaskListFilters(userId, taskTypeId, isClosed),
            cancellationToken);
        return Ok(tasks.Select(t => t.ToListItem()).ToList());
    }

    // GET /api/tasks/{id} — returns the full TaskDetail for a single task, or a 404 ProblemDetails
    // via the standard WorkflowError pipeline when no task with that id exists.
    [HttpGet("{id:int}")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadById))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetById(
        // Surrogate key of the task to fetch.
        int id,
        // Aborts the query if the client disconnects mid-request.
        CancellationToken cancellationToken)
    {
        // Tracked task entity (or null when not found) returned by the service.
        var task = await service.GetByIdAsync(id, cancellationToken);
        return task is null
            ? await this.ToActionResult(new Domain.Errors.WorkflowError.TaskNotFound(id))
            : Ok(task.ToDetail(registry));
    }

    // POST /api/tasks — creates a new task of the given type, optionally pre-assigned to a user.
    // Returns 201 Created with the new TaskDetail and a Location header pointing at GetById.
    [HttpPost]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.Create))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(
        // JSON body carrying the task-type id and optional initial assignee id.
        [FromBody] CreateTaskRequest request,
        // Aborts the create + SaveChanges if the client disconnects.
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.CreateAsync(request.TaskTypeId, request.InitialAssignedUserId, cancellationToken),
            // Success projection: convert the created entity to its DTO and wrap in a 201 result.
            v =>
            {
                // Enriched response DTO including registry-derived field metadata.
                var r = v.ToDetail(registry);
                return CreatedAtAction(nameof(GetById), new { id = r.Id }, r);
            });

    // POST /api/tasks/{id}/status — moves a task to a new status, validating the transition,
    // per-status custom-data shape, and optional reassignment in one atomic SaveChanges.
    [HttpPost("{id:int}/status")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.WorkflowWrite))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> ChangeStatus(
        // Surrogate key of the task to transition.
        int id,
        // Target status code, the per-status custom-data JSON, and optional next assignee.
        [FromBody] ChangeStatusRequest request,
        // Aborts the transition + SaveChanges if the client disconnects.
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.ChangeStatusAsync(id, request.NewStatus, request.CustomData, request.NextAssignedUserId, cancellationToken),
            // Success projection: emit the updated TaskDetail.
            v => Ok(v.ToDetail(registry)));

    // POST /api/tasks/{id}/steps — edits captured data on a prior or the current status without
    // moving the task forward. UX affordance for correcting values entered earlier.
    [HttpPost("{id:int}/steps")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.WorkflowWrite))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateStep(
        // Surrogate key of the task whose step data is being edited.
        int id,
        // Target status whose captured data is being rewritten, the new custom-data payload,
        // and an optional reassignment for that step.
        [FromBody] UpdateStepDataRequest request,
        // Aborts the update + SaveChanges if the client disconnects.
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.UpdateStepDataAsync(id, request.Status, request.CustomData, request.AssignedUserId, cancellationToken),
            // Success projection: emit the updated TaskDetail.
            v => Ok(v.ToDetail(registry)));

    // POST /api/tasks/{id}/close — marks the task as closed. Subsequent writes are rejected
    // by the domain (closed-immutable rule).
    [HttpPost("{id:int}/close")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.WorkflowWrite))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> Close(
        // Surrogate key of the task being closed.
        int id,
        // Aborts the close + SaveChanges if the client disconnects.
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.CloseAsync(id, cancellationToken),
            // Success projection: emit the closed task's TaskDetail.
            v => Ok(v.ToDetail(registry)));
}
