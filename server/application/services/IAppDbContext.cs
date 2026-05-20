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
    // Users table — the assignee universe; queried for existence checks before assigning a task.
    DbSet<User> Users { get; }
    // Tasks table — the aggregate root the workflow engine operates on.
    DbSet<TaskItem> Tasks { get; }
    // TaskTypes table — usually accessed through ITaskTypeRegistry rather than directly.
    DbSet<TaskType> TaskTypes { get; }
    // StatusDefinitions table — the per-type ordered list of workflow steps.
    DbSet<StatusDefinition> StatusDefinitions { get; }
    // Lookup table mapping StatusFieldKind enum values to their text codes (String / Number).
    DbSet<StatusFieldKindRow> StatusFieldKinds { get; }
    // Per-status custom-field schema rows (name + kind + min/max + itemCount).
    DbSet<StatusFieldSpec> StatusFieldSpecs { get; }
    // Captured custom-field values for a given task + status + item index.
    DbSet<TaskFieldValue> TaskFieldValues { get; }
    // Per-status assignment audit rows: who held the task while it was in status X.
    DbSet<TaskAssignment> TaskAssignments { get; }

    // The single atomic write per request — controllers must not call SaveChangesAsync twice
    // since EnableRetryOnFailure relies on each request being a single, idempotent unit of work.
    Task<int> SaveChangesAsync(
        // Aborts the save if the client disconnects mid-request.
        CancellationToken cancellationToken = default);

    // Direct access to the EF change-tracker entry for one entity. Required by
    // DetachStatusDefinitionNavigations to flip a navigation's State to Unchanged.
    EntityEntry Entry(
        // The tracked or untracked entity whose entry we want to inspect / mutate.
        object entity);
}
