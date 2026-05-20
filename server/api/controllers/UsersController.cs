using Microsoft.AspNetCore.Mvc;
using TaskPlatform.Api.Contracts;
using TaskPlatform.Application.Services;

namespace TaskPlatform.Api.Controllers;

// Lists seeded demo users for the assignee picker. No user CRUD by design.
[ApiController]
[Route("api/users")]
public sealed class UsersController(TaskService service) : ControllerBase
{
    
    [HttpGet]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadList))]
    [ProducesResponseType(typeof(IReadOnlyList<UserResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<UserResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var users = await service.GetAllUsersAsync(cancellationToken);
        return Ok(users.Select(u => u.ToResponse()).ToList());
    }
}
