using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Tests.Integration;

[Trait("Category", "Integration")]
public sealed class ConcurrencyIntegrationTests : IClassFixture<DatabaseFixture>, IAsyncLifetime
{
    private readonly DatabaseFixture _fixture;

    public ConcurrencyIntegrationTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    public async Task InitializeAsync()
    {
        await using var db = _fixture.CreateContext();
        await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task RowVersion_Mismatch_Throws_DbUpdateConcurrencyException()
    {
        
        int taskId;
        await using (var pick = _fixture.CreateContext())
        {
            taskId = await pick.Tasks
                .Where(t => !t.IsClosed)
                .OrderBy(t => t.Id)
                .Select(t => t.Id)
                .FirstAsync();
        }

        await using var ctxA = _fixture.CreateContext();
        await using var ctxB = _fixture.CreateContext();

        var taskA = await ctxA.Tasks.FirstAsync(t => t.Id == taskId);
        var taskB = await ctxB.Tasks.FirstAsync(t => t.Id == taskId);

        BumpUpdatedAt(ctxA, taskA, DateTime.UtcNow);
        await ctxA.SaveChangesAsync();

        BumpUpdatedAt(ctxB, taskB, DateTime.UtcNow.AddSeconds(1));
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => ctxB.SaveChangesAsync());
    }

    private static void BumpUpdatedAt(AppDbContext ctx, TaskItem task, DateTime when)
    {
        var entry = ctx.Entry(task);
        entry.Property(nameof(TaskItem.UpdatedAtUtc)).CurrentValue = when;
        entry.Property(nameof(TaskItem.UpdatedAtUtc)).IsModified = true;
    }
}
