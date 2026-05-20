using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Pinned ids so FKs on hot-path tables survive seed reordering. Two unique indexes guarantee
// Code and Position are each unique within a task type, enforcing the ordered-integer invariant.

// EF Core configuration for StatusDefinition — the metadata node describing one status in a task
// type's workflow (code, display name, position, finality flag).
public sealed class StatusDefinitionConfiguration : IEntityTypeConfiguration<StatusDefinition>
{
    // Pins surrogate ids (ADR-07), enforces required scalars, and wires up the field-backed
    // accessor for the Fields collection so EF mutates the private list directly.
    public void Configure(
        // EF's per-entity fluent builder for StatusDefinition.
        EntityTypeBuilder<StatusDefinition> b)
    {
        b.ToTable("StatusDefinitions");
        b.HasKey(s => s.Id);
        // ValueGeneratedNever: ids are pinned by the seed/migration. TaskItem.CurrentStatusDefinitionId
        // and StatusFieldSpec.StatusDefinitionId both point here, so stable ids are non-negotiable.
        b.Property(s => s.Id).ValueGeneratedNever();
        b.Property(s => s.TaskTypeId).IsRequired();
        b.Property(s => s.Code).IsRequired();
        b.Property(s => s.Name).HasMaxLength(128).IsRequired();
        b.Property(s => s.Position).IsRequired();
        b.Property(s => s.IsFinal).IsRequired();

        // Code is unique within a task type — the workflow engine resolves transitions by code.
        b.HasIndex(s => new { s.TaskTypeId, s.Code }).IsUnique();
        // Position is unique within a task type — enforces the ordered-integer chain that
        // forward/backward transitions walk.
        b.HasIndex(s => new { s.TaskTypeId, s.Position }).IsUnique();

        // Field-backed access: EF reads/writes the private _fields list directly so the domain's
        // collection invariants stay enforced through the aggregate's public mutators.
        b.Navigation(s => s.Fields).Metadata.SetField("_fields");
        b.Navigation(s => s.Fields).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
