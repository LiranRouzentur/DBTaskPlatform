using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Application.Services;

// DB seam: controllers/services depend on this interface, not the concrete AppDbContext.
// Entry(object) is exposed so TaskService.DetachStatusDefinitionNavigations can flip entry
// state without an unsafe `db is DbContext` cast.
public interface IAppDbContext
{
    DbSet<User> Users { get; }
    DbSet<TaskItem> Tasks { get; }
    DbSet<TaskType> TaskTypes { get; }
    DbSet<StatusDefinition> StatusDefinitions { get; }
    DbSet<StatusFieldKindRow> StatusFieldKinds { get; }
    DbSet<StatusFieldSpec> StatusFieldSpecs { get; }
    DbSet<TaskFieldValue> TaskFieldValues { get; }
    DbSet<TaskAssignment> TaskAssignments { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    EntityEntry Entry(object entity);
}
