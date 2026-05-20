using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Per-(task, status) row with a composite natural key — no surrogate, no soft-delete column.
// Backward moves HARD-delete assignments above the new target; forward re-entry recreates them
// via TaskItem.UpsertAssignment (observably equivalent to soft-delete; keeps the table small).

// EF Core configuration for TaskAssignment — records who was assigned to a task at each status.
public sealed class TaskAssignmentConfiguration : IEntityTypeConfiguration<TaskAssignment>
{
    // Wires up the composite key, required scalars, and restricted FKs to User and StatusDefinition
    // so neither can be hard-deleted while an assignment references them.
    public void Configure(
        // EF's per-entity fluent builder for TaskAssignment.
        EntityTypeBuilder<TaskAssignment> b)
    {
        b.ToTable("TaskAssignments");

        // Composite natural key — there is at most one assignment per (task, status). No surrogate
        // id keeps the table narrow and lets upserts use the obvious key without a lookup.
        b.HasKey(a => new { a.TaskId, a.StatusDefinitionId });
        b.Property(a => a.AssignedUserId).IsRequired();
        b.Property(a => a.AssignedAtUtc).IsRequired();

        b.HasOne<User>()
            .WithMany()
            .HasForeignKey(a => a.AssignedUserId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne<StatusDefinition>()
            .WithMany()
            .HasForeignKey(a => a.StatusDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
