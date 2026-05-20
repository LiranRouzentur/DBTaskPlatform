using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence.Configurations;

// Lookup backing the StatusFieldKind enum. Pinned ids match enum values (1=String, 2=Number);
// runtime code dispatches on the enum, never on this row.

// EF Core configuration for StatusFieldKindRow — the lookup table that gives the StatusFieldKind
// enum DB-level referential integrity via StatusFieldSpec.KindId. Seeded by the initial migration.
public sealed class StatusFieldKindRowConfiguration : IEntityTypeConfiguration<StatusFieldKindRow>
{
    // Maps the lookup table, pins ids to the enum values, and enforces a unique Kind so the
    // lookup can be resolved by name as well as by id.
    public void Configure(
        // EF's per-entity fluent builder for StatusFieldKindRow.
        EntityTypeBuilder<StatusFieldKindRow> b)
    {
        b.ToTable("StatusFieldKinds");
        b.HasKey(k => k.Id);
        // ValueGeneratedNever: ids must equal the StatusFieldKind enum integer values
        // (1 = String, 2 = Number). Adding a new kind means migrating a new row with a chosen id.
        b.Property(k => k.Id).ValueGeneratedNever();
        b.Property(k => k.Kind).HasMaxLength(32).IsRequired();
        b.HasIndex(k => k.Kind).IsUnique();
    }
}
