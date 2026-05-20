using Microsoft.AspNetCore.Mvc;
using TaskPlatform.Api.Contracts;
using TaskPlatform.Application.Services;

namespace TaskPlatform.Api.Controllers;

// Returns every task type + statuses + field specs. Drives the client's dynamic form so adding
// a task type requires no Angular code. Synchronous: registry is in-memory.
[ApiController]
[Route("api/task-types")]
public sealed class TaskTypesController(TaskService service) : ControllerBase
{
    
    [HttpGet]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadList))]
    [ProducesResponseType(typeof(IReadOnlyList<TaskTypeMetadataResponse>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<TaskTypeMetadataResponse>> GetAll()
    {
        var types = service.GetTaskTypes();
        return Ok(types
            .OrderBy(t => t.Name)
            .Select(t => t.ToResponse())
            .ToList());
    }
}
