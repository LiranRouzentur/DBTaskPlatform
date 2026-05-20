using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// One row per per-status field; ItemCount > 1 means a fixed-length array. Pinned ids so child
// TaskFieldValue references survive renames and migrations. KindId FK guarantees DB-level
// integrity over the StatusFieldKind enum.

// EF Core configuration for StatusFieldSpec — the metadata describing one field captured at a
// given status (name, kind, item count, optional min/max bounds).
public sealed class StatusFieldSpecConfiguration : IEntityTypeConfiguration<StatusFieldSpec>
{
    // Pins surrogate ids (ADR-07), enforces required scalars, and adds two unique indexes that
    // guarantee Name and Position are unique per parent status.
    public void Configure(
        // EF's per-entity fluent builder for StatusFieldSpec.
        EntityTypeBuilder<StatusFieldSpec> b)
    {
        b.ToTable("StatusFieldSpecs");

        b.HasKey(f => f.Id);
        // ValueGeneratedNever: ids come from the migration/seed, not IDENTITY. Critical because
        // TaskFieldValue.StatusFieldSpecId FKs must survive seed reordering and re-runs.
        b.Property(f => f.Id).ValueGeneratedNever();
        b.Property(f => f.StatusDefinitionId).IsRequired();
        b.Property(f => f.Name).HasMaxLength(64).IsRequired();
        b.Property(f => f.KindId).IsRequired();
        b.Property(f => f.ItemCount).IsRequired();
        b.Property(f => f.Position).IsRequired();
        b.Property(f => f.Min);
        b.Property(f => f.Max);

        b.HasOne<StatusFieldKindRow>()
            .WithMany()
            .HasForeignKey(f => f.KindId)
            .OnDelete(DeleteBehavior.Restrict);

        // Name must be unique within a status — UI binds form controls by name.
        b.HasIndex(f => new { f.StatusDefinitionId, f.Name }).IsUnique();
        // Position must be unique within a status — drives stable rendering order on the client.
        b.HasIndex(f => new { f.StatusDefinitionId, f.Position }).IsUnique();
    }
}
