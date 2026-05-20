using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Pinned ids so FKs on hot-path tables survive seed reordering. Two unique indexes guarantee
// Code and Position are each unique within a task type, enforcing the ordered-integer invariant.
public sealed class StatusDefinitionConfiguration : IEntityTypeConfiguration<StatusDefinition>
{
    public void Configure(EntityTypeBuilder<StatusDefinition> b)
    {
        b.ToTable("StatusDefinitions");
        b.HasKey(s => s.Id);
        b.Property(s => s.Id).ValueGeneratedNever();
        b.Property(s => s.TaskTypeId).IsRequired();
        b.Property(s => s.Code).IsRequired();
        b.Property(s => s.Name).HasMaxLength(128).IsRequired();
        b.Property(s => s.Position).IsRequired();
        b.Property(s => s.IsFinal).IsRequired();

        b.HasIndex(s => new { s.TaskTypeId, s.Code }).IsUnique();
        b.HasIndex(s => new { s.TaskTypeId, s.Position }).IsUnique();

        b.Navigation(s => s.Fields).Metadata.SetField("_fields");
        b.Navigation(s => s.Fields).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
