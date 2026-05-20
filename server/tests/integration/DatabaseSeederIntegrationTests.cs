using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using TaskPlatform.Data.Persistence;

namespace TaskPlatform.Tests.Integration;

[Trait("Category", "Integration")]
public sealed class DatabaseSeederIntegrationTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fixture;

    public DatabaseSeederIntegrationTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task SeedAsync_On_Fresh_Database_Populates_Expected_Counts()
    {
        await using var db = _fixture.CreateContext();
        var seeder = new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance);

        await seeder.SeedAsync();

        Assert.Equal(5, await db.Users.CountAsync());
        Assert.Equal(2, await db.TaskTypes.CountAsync());
        Assert.Equal(7, await db.StatusDefinitions.CountAsync());
        Assert.Equal(5, await db.StatusFieldSpecs.CountAsync());
        Assert.Equal(2, await db.StatusFieldKinds.CountAsync()); 
        Assert.Equal(20, await db.Tasks.CountAsync());

        Assert.Equal(36, await db.TaskFieldValues.CountAsync());

        Assert.Equal(49, await db.TaskAssignments.CountAsync());
    }

    [Fact]
    public async Task SeedAsync_Is_Idempotent()
    {
        await using (var db = _fixture.CreateContext())
        {
            await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();
        }

        await using (var db = _fixture.CreateContext())
        {
            
            await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();
            await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();
        }

        await using (var db = _fixture.CreateContext())
        {
            Assert.Equal(5, await db.Users.CountAsync());
            Assert.Equal(20, await db.Tasks.CountAsync());
        }
    }

    [Fact]
    public async Task Seeded_Procurement_Task_2_Has_PriceQuotes_With_Two_Items()
    {
        await using var db = _fixture.CreateContext();
        await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();

        var task = await db.Tasks
            .AsNoTracking()
            .Include(t => t.CurrentStatusDefinition)
            .Include(t => t.FieldValues)
                .ThenInclude(v => v.Spec)
            .Where(t => t.TaskTypeId == 1 && t.CurrentStatusDefinition.Code == 2 && !t.IsClosed)
            .FirstAsync();

        var quotes = task.FieldValues.OrderBy(v => v.ItemIndex).ToList();
        Assert.Equal(2, quotes.Count);
        Assert.All(quotes, q => Assert.Equal("priceQuotes", q.Spec.Name));
        Assert.All(quotes, q => Assert.False(string.IsNullOrEmpty(q.StringValue)));
    }

    [Fact]
    public async Task Seeded_Closed_Tasks_Have_IsClosed_True()
    {
        await using var db = _fixture.CreateContext();
        await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();

        var closedCount = await db.Tasks.CountAsync(t => t.IsClosed);
        Assert.Equal(3, closedCount);
    }

    [Fact]
    public async Task Seeded_Development_Task_8_Carries_Full_Status_History()
    {
        await using var db = _fixture.CreateContext();
        await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();

        var statusCodeById = await db.StatusDefinitions
            .AsNoTracking()
            .Where(s => s.TaskTypeId == 2)
            .ToDictionaryAsync(s => s.Id, s => s.Code);

        var task = await db.Tasks
            .AsNoTracking()
            .Include(t => t.CurrentStatusDefinition)
            .Include(t => t.FieldValues)
                .ThenInclude(v => v.Spec)
            .Include(t => t.Assignments)
            .Where(t => t.TaskTypeId == 2 && t.CurrentStatusDefinition.Code == 4 && !t.IsClosed)
            .FirstAsync();

        Assert.Equal(4, task.CurrentStatusDefinition.Code);

        Assert.Equal(3, task.FieldValues.Count);
        Assert.Contains(task.FieldValues, v => statusCodeById[v.Spec.StatusDefinitionId] == 2 && v.Spec.Name == "specification");
        Assert.Contains(task.FieldValues, v => statusCodeById[v.Spec.StatusDefinitionId] == 3 && v.Spec.Name == "branchName");
        Assert.Contains(task.FieldValues, v => statusCodeById[v.Spec.StatusDefinitionId] == 4 && v.Spec.Name == "versionNumber");

        Assert.Equal(4, task.Assignments.Count);
        Assert.All(new[] { 1, 2, 3, 4 }, code =>
            Assert.Contains(task.Assignments, a => statusCodeById[a.StatusDefinitionId] == code));
    }
}
