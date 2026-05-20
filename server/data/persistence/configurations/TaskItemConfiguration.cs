using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Aggregate-root config. RowVersion drives optimistic concurrency (→409); global filter on
// IsDeleted hides soft-deleted tasks; (CurrentAssignedUserId, IsClosed) index backs the
// per-user open-tasks query.

// EF Core configuration for the TaskItem aggregate root. Auto-discovered by
// ApplyConfigurationsFromAssembly in AppDbContext.OnModelCreating.
public sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    // Maps the TaskItem entity to the TaskItems table and wires up keys, indexes, navigations,
    // the soft-delete query filter, and the field-backed collection accessors.
    public void Configure(
        // EF's per-entity fluent builder for TaskItem; receives every metadata call below.
        EntityTypeBuilder<TaskItem> b)
    {
        b.ToTable("TaskItems");
        b.HasKey(t => t.Id);

        b.Property(t => t.TaskTypeId).IsRequired();
        b.Property(t => t.CurrentStatusDefinitionId).IsRequired();
        b.Property(t => t.IsClosed).IsRequired();
        b.Property(t => t.CurrentAssignedUserId).IsRequired();
        // Optimistic-concurrency token. EF translates a mismatch into DbUpdateConcurrencyException,
        // which the ConcurrencyExceptionHandler converts to a 409 ProblemDetails.
        b.Property(t => t.RowVersion).IsRowVersion();
        b.Property(t => t.CreatedAtUtc).IsRequired();
        b.Property(t => t.UpdatedAtUtc).IsRequired();
        // Soft-delete marker. Nullable bool: null = live, true = retired. `false` is not a valid state.
        b.Property(t => t.IsDeleted);

        // Global query filter — every read of Tasks excludes soft-deleted rows unless the caller
        // opts out with IgnoreQueryFilters() inside a repository method (never globally).
        b.HasQueryFilter(t => t.IsDeleted == null);

        b.HasIndex(t => t.CurrentAssignedUserId);
        b.HasIndex(t => new { t.CurrentAssignedUserId, t.IsClosed });
        b.HasIndex(t => t.TaskTypeId);

        b.HasOne<User>()
            .WithMany()
            .HasForeignKey(t => t.CurrentAssignedUserId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne<TaskType>()
            .WithMany()
            .HasForeignKey(t => t.TaskTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne(t => t.CurrentStatusDefinition)
            .WithMany()
            .HasForeignKey(t => t.CurrentStatusDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasMany(t => t.FieldValues)
            .WithOne()
            .HasForeignKey(v => v.TaskId)
            .OnDelete(DeleteBehavior.Cascade);

        // Field-backed access: EF reads/writes the private _fieldValues list directly, preserving
        // the domain invariant that callers can only mutate the collection through aggregate methods.
        b.Navigation(t => t.FieldValues).Metadata.SetField("_fieldValues");
        b.Navigation(t => t.FieldValues).UsePropertyAccessMode(PropertyAccessMode.Field);

        b.HasMany(t => t.Assignments)
            .WithOne()
            .HasForeignKey(a => a.TaskId)
            .OnDelete(DeleteBehavior.Cascade);

        // Same field-backed pattern for assignments — EF bypasses the public getter so domain
        // mutators stay the only path to add/remove entries.
        b.Navigation(t => t.Assignments).Metadata.SetField("_assignments");
        b.Navigation(t => t.Assignments).UsePropertyAccessMode(PropertyAccessMode.Field);

        // Code is a derived getter (computed from the current status), not a column.
        b.Ignore(t => t.Code);
    }
}
