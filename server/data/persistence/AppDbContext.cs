using Microsoft.EntityFrameworkCore;
using TaskPlatform.Application.Services;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Data.Persistence;

// Concrete DbContext. Per-entity Fluent API lives under Persistence/Configurations/*.cs and is
// auto-registered via ApplyConfigurationsFromAssembly — add new entities there, not here.
public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : DbContext(options), IAppDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskType> TaskTypes => Set<TaskType>();
    public DbSet<StatusDefinition> StatusDefinitions => Set<StatusDefinition>();
    public DbSet<StatusFieldKindRow> StatusFieldKinds => Set<StatusFieldKindRow>();
    public DbSet<StatusFieldSpec> StatusFieldSpecs => Set<StatusFieldSpec>();
    public DbSet<TaskFieldValue> TaskFieldValues => Set<TaskFieldValue>();
    public DbSet<TaskAssignment> TaskAssignments => Set<TaskAssignment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
