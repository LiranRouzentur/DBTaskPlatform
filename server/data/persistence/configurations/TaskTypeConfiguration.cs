using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Unique Name + pinned Id. Restrict delete — types can't be removed while tasks reference them.
// FinalStatus* are derived getters, not columns (Ignored).
public sealed class TaskTypeConfiguration : IEntityTypeConfiguration<TaskType>
{
    public void Configure(EntityTypeBuilder<TaskType> b)
    {
        b.ToTable("TaskTypes");
        b.HasKey(t => t.Id);
        b.Property(t => t.Id).ValueGeneratedNever();
        b.Property(t => t.Name).HasMaxLength(64).IsRequired();
        b.HasIndex(t => t.Name).IsUnique();

        b.HasMany(t => t.Statuses)
            .WithOne()
            .HasForeignKey(s => s.TaskTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        b.Navigation(t => t.Statuses).Metadata.SetField("_statuses");
        b.Navigation(t => t.Statuses).UsePropertyAccessMode(PropertyAccessMode.Field);

        b.Ignore(t => t.FinalStatusCode);
        b.Ignore(t => t.FinalStatus);
    }
}
