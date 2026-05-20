using Microsoft.AspNetCore.Mvc;
using TaskPlatform.Api.Contracts;
using TaskPlatform.Application.Services;

namespace TaskPlatform.Api.Controllers;

// Lists seeded demo users for the assignee picker. No user CRUD by design.
[ApiController]
[Route("api/users")]
public sealed class UsersController(
    // Application-layer service that owns the User read path; no separate UserService by design.
    TaskService service) : ControllerBase
{

    // GET /api/users — returns the full list of seeded demo users. The Angular client caches
    // this once per session and uses it for every assignee picker.
    [HttpGet]
    [ApiConventionMethod(typeof(WorkflowApiConventions), nameof(WorkflowApiConventions.ReadList))]
    [ProducesResponseType(typeof(IReadOnlyList<UserResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<UserResponse>>> GetAll(
        // Aborts the EF query if the client disconnects mid-request.
        CancellationToken cancellationToken)
    {
        // Materialized User entities; AsNoTracking inside the service since users are read-only.
        var users = await service.GetAllUsersAsync(cancellationToken);
        return Ok(users.Select(u => u.ToResponse()).ToList());
    }
}
