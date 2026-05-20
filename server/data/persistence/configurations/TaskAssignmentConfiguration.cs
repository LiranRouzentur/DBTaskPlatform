using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Per-(task, status) row with a composite natural key — no surrogate, no soft-delete column.
// Backward moves HARD-delete assignments above the new target; forward re-entry recreates them
// via TaskItem.UpsertAssignment (observably equivalent to soft-delete; keeps the table small).
public sealed class TaskAssignmentConfiguration : IEntityTypeConfiguration<TaskAssignment>
{
    public void Configure(EntityTypeBuilder<TaskAssignment> b)
    {
        b.ToTable("TaskAssignments");
        
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
