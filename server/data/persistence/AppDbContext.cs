using Microsoft.EntityFrameworkCore;
using TaskPlatform.Application.Services;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence;

// Concrete DbContext. Per-entity Fluent API lives under Persistence/Configurations/*.cs and is
// auto-registered via ApplyConfigurationsFromAssembly — add new entities there, not here.

// The application-wide EF Core context. Implements IAppDbContext (defined in the application layer)
// so domain/application code depends on the seam, not on EF — this keeps EF references out of
// upper layers and lets tests use the seam directly when appropriate.
public sealed class AppDbContext(
    // EF Core options bag (connection string, retry policy, logger factory) supplied by DI.
    // Passed straight through to the base DbContext constructor.
    DbContextOptions<AppDbContext> options)
    : DbContext(options), IAppDbContext
{
    // Users table. Identity-PK aggregate root; referenced by TaskItem.CurrentAssignedUserId and
    // TaskAssignment.AssignedUserId via Restrict delete (users can't be hard-deleted while in use).
    public DbSet<User> Users => Set<User>();
    // Task aggregate root. A global query filter on IsDeleted hides soft-deleted rows on every read;
    // bypass with IgnoreQueryFilters() at the repository level only — never globally.
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    // Metadata: task type definitions. Loaded once into the TaskTypeRegistry at startup; rows here
    // are effectively immutable at runtime (adding a new type requires app restart).
    public DbSet<TaskType> TaskTypes => Set<TaskType>();
    // Metadata: per-task-type status nodes. Surrogate ids are pinned (see ADR-07) so FKs on hot-path
    // tables survive seed reordering and migrations.
    public DbSet<StatusDefinition> StatusDefinitions => Set<StatusDefinition>();
    // Lookup table backing the StatusFieldKind enum. Provides DB-level referential integrity for
    // the kind discriminator on StatusFieldSpec.KindId.
    public DbSet<StatusFieldKindRow> StatusFieldKinds => Set<StatusFieldKindRow>();
    // Metadata: per-status field specs (name, kind, item count, position, min/max). Pinned ids
    // keep TaskFieldValue.StatusFieldSpecId FKs stable across migrations.
    public DbSet<StatusFieldSpec> StatusFieldSpecs => Set<StatusFieldSpec>();
    // Captured field values per (task, spec, item index). Filtered unique index on live rows only
    // (IsDeleted IS NULL) lets backward/forward moves coexist with retired rows — see R-01.
    public DbSet<TaskFieldValue> TaskFieldValues => Set<TaskFieldValue>();
    // Per-(task, status) assignment record. Composite natural key; backward moves hard-delete
    // assignments above the new target instead of soft-deleting (keeps the table small).
    public DbSet<TaskAssignment> TaskAssignments => Set<TaskAssignment>();

    // Hook EF calls during model build. We delegate every per-entity configuration to the
    // IEntityTypeConfiguration<T> classes under Configurations/ — keeps this method one-liner.
    protected override void OnModelCreating(
        // EF's fluent builder used by ApplyConfigurationsFromAssembly to register each configuration.
        ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
