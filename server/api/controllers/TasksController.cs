using Microsoft.AspNetCore.Mvc;
using TaskPlatform.Api.Contracts;
using TaskPlatform.Api.ExceptionHandlers;
using TaskPlatform.Application.Services;
using TaskPlatform.Application.Workflow;

namespace TaskPlatform.Api.Controllers;

// Intentionally thin: DTO → TaskService → ToActionResult. The /steps endpoint edits prior or
// current-status data in place without moving the task (UX affordance for fixing captured values).
[ApiController]
[Route("api/tasks")]
public sealed class TasksController(TaskService service, ITaskTypeRegistry registry) : ControllerBase
{
    
    [HttpGet]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadList))]
    [ProducesResponseType(typeof(IReadOnlyList<TaskListItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<TaskListItem>>> List(
        [FromQuery] int? userId,
        [FromQuery] int? taskTypeId,
        [FromQuery] bool? isClosed,
        CancellationToken cancellationToken)
    {
        var tasks = await service.ListAsync(
            new TaskListFilters(userId, taskTypeId, isClosed),
            cancellationToken);
        return Ok(tasks.Select(t => t.ToListItem()).ToList());
    }

    [HttpGet("{id:int}")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadById))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
    {
        var task = await service.GetByIdAsync(id, cancellationToken);
        return task is null
            ? await this.ToActionResult(new Domain.Errors.WorkflowError.TaskNotFound(id))
            : Ok(task.ToDetail(registry));
    }

    [HttpPost]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.Create))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(
        [FromBody] CreateTaskRequest request,
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.CreateAsync(request.TaskTypeId, request.InitialAssignedUserId, cancellationToken),
            v =>
            {
                var r = v.ToDetail(registry);
                return CreatedAtAction(nameof(GetById), new { id = r.Id }, r);
            });

    [HttpPost("{id:int}/status")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.WorkflowWrite))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> ChangeStatus(
        int id,
        [FromBody] ChangeStatusRequest request,
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.ChangeStatusAsync(id, request.NewStatus, request.CustomData, request.NextAssignedUserId, cancellationToken),
            v => Ok(v.ToDetail(registry)));

    [HttpPost("{id:int}/steps")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.WorkflowWrite))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateStep(
        int id,
        [FromBody] UpdateStepDataRequest request,
        CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.UpdateStepDataAsync(id, request.Status, request.CustomData, request.AssignedUserId, cancellationToken),
            v => Ok(v.ToDetail(registry)));

    [HttpPost("{id:int}/close")]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.WorkflowWrite))]
    [ProducesResponseType(typeof(TaskDetail), StatusCodes.Status200OK)]
    public async Task<IActionResult> Close(int id, CancellationToken cancellationToken)
        => await this.ToActionResult(
            await service.CloseAsync(id, cancellationToken),
            v => Ok(v.ToDetail(registry)));
}
