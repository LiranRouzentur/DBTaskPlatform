using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TaskPlatform.Application.Mapping;
using TaskPlatform.Application.Services;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Data.Persistence;
using TaskPlatform.Data.Workflow;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Tests.Integration;

[Trait("Category", "Integration")]
public sealed class TaskServicePersistenceIntegrationTests
    : IClassFixture<DatabaseFixture>, IAsyncLifetime
{
    private readonly DatabaseFixture _fixture;
    
    private const int Alice = 1;
    private const int Bob = 2;
    private const int Carol = 3;

    private ServiceProvider? _services;

    public TaskServicePersistenceIntegrationTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    public async Task InitializeAsync()
    {
        await using var db = _fixture.CreateContext();
        await new DatabaseSeeder(db, NullLogger<DatabaseSeeder>.Instance).SeedAsync();

        var services = new ServiceCollection();
        services.AddDbContextFactory<AppDbContext>(
            opt => opt.UseSqlServer(_fixture.ConnectionString),
            lifetime: ServiceLifetime.Singleton);

        var registry = new TaskTypeRegistry(
            services.BuildServiceProvider().GetRequiredService<IDbContextFactory<AppDbContext>>());
        await registry.EnsureLoadedAsync();

        services.AddSingleton<ITaskTypeRegistry>(registry);
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<WorkflowEngine>();
        _services = services.BuildServiceProvider();
    }

    public Task DisposeAsync()
    {
        _services?.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task CreateAsync_Persists_TaskItem_With_Initial_State()
    {
        var service = NewService(out var ctx);
        await using (ctx)
        {
            var outcome = await service.CreateAsync(1, Alice);

            Assert.True(outcome.IsSuccess);
            var task = outcome.Value!;
            Assert.Equal(1, task.TaskTypeId);
            Assert.Equal(1, task.Code);
            Assert.False(task.IsClosed);
            Assert.Equal(Alice, task.CurrentAssignedUserId);
        }

        await using var verify = _fixture.CreateContext();
        var persistedCount = await verify.Tasks.CountAsync(t => t.CurrentAssignedUserId == Alice);
        Assert.True(persistedCount >= 3); 
    }

    [Fact]
    public async Task ChangeStatus_Persists_StringArray_As_JsonValue()
    {
        var service = NewService(out var ctx);
        int taskId;

        await using (ctx)
        {
            var created = await service.CreateAsync(1, Alice);
            taskId = created.Value!.Id;

            var data = JsonDocument.Parse("""{"priceQuotes":["A","B"]}""").RootElement;
            var changed = await service.ChangeStatusAsync(taskId, newStatus: 2, data, Bob);
            Assert.True(changed.IsSuccess);
        }

        await using var verify = _fixture.CreateContext();
        var values = await verify.TaskFieldValues
            .Include(v => v.Spec)
            .Where(v => v.TaskId == taskId)
            .OrderBy(v => v.ItemIndex)
            .ToListAsync();

        Assert.Equal(2, values.Count);
        Assert.All(values, v => Assert.Equal("priceQuotes", v.Spec.Name));
        Assert.Equal(new[] { "A", "B" }, values.Select(v => v.StringValue).ToArray());
        Assert.Equal(new[] { 1, 2 }, values.Select(v => v.ItemIndex).ToArray());
    }

    [Fact]
    public async Task ChangeStatus_Retains_History_Of_Prior_Stage_Values()
    {
        var service = NewService(out var ctx);
        int taskId;

        await using (ctx)
        {
            taskId = (await service.CreateAsync(1, Alice)).Value!.Id;

            await service.ChangeStatusAsync(
                taskId, 2,
                JsonDocument.Parse("""{"priceQuotes":["A","B"]}""").RootElement,
                Bob);

            await service.ChangeStatusAsync(
                taskId, 3,
                JsonDocument.Parse("""{"receipt":"INV-001"}""").RootElement,
                Carol);
        }

        await using var verify = _fixture.CreateContext();
        var values = await verify.TaskFieldValues
            .Include(v => v.Spec)
            .Where(v => v.TaskId == taskId)
            .OrderBy(v => v.Spec.StatusDefinitionId).ThenBy(v => v.ItemIndex)
            .ToListAsync();

        Assert.Equal(3, values.Count);

        var quotes = values.Where(v => v.Spec.Name == "priceQuotes").OrderBy(v => v.ItemIndex).ToList();
        Assert.Equal(2, quotes.Count);
        Assert.Equal(new[] { "A", "B" }, quotes.Select(q => q.StringValue).ToArray());

        var receipt = values.Single(v => v.Spec.Name == "receipt");
        Assert.Equal("INV-001", receipt.StringValue);
    }

    [Fact]
    public async Task CloseAsync_Flips_IsClosed_And_Persists()
    {
        var service = NewService(out var ctx);
        int taskId;

        await using (ctx)
        {
            taskId = (await service.CreateAsync(1, Alice)).Value!.Id;
            await service.ChangeStatusAsync(taskId, 2,
                JsonDocument.Parse("""{"priceQuotes":["A","B"]}""").RootElement, Bob);
            await service.ChangeStatusAsync(taskId, 3,
                JsonDocument.Parse("""{"receipt":"X"}""").RootElement, Carol);
            var outcome = await service.CloseAsync(taskId);
            Assert.True(outcome.IsSuccess);
        }

        await using var verify = _fixture.CreateContext();
        var task = await verify.Tasks.FirstAsync(t => t.Id == taskId);
        Assert.True(task.IsClosed);
    }

    [Fact]
    public async Task Deleting_TaskItem_Cascades_To_FieldValues()
    {
        
        int taskId;
        await using (var db = _fixture.CreateContext())
        {
            var task = await db.Tasks
                .Include(t => t.CurrentStatusDefinition)
                .Where(t => t.TaskTypeId == 1 && t.CurrentStatusDefinition.Code == 2 && !t.IsClosed)
                .FirstAsync();
            taskId = task.Id;
            db.Tasks.Remove(task);
            await db.SaveChangesAsync();
        }

        await using var verify = _fixture.CreateContext();
        Assert.False(await verify.Tasks.AnyAsync(t => t.Id == taskId));
        Assert.False(await verify.TaskFieldValues.AnyAsync(v => v.TaskId == taskId));
        Assert.False(await verify.TaskAssignments.AnyAsync(a => a.TaskId == taskId));
    }

    [Fact]
    public async Task ReEntering_Previously_Retired_Status_Does_Not_Violate_Unique_Index()
    {
        
        var service = NewService(out var ctx);
        int taskId;

        await using (ctx)
        {
            
            taskId = (await service.CreateAsync(1, Alice)).Value!.Id;
            await service.ChangeStatusAsync(taskId, 2,
                JsonDocument.Parse("""{"priceQuotes":["A","B"]}""").RootElement, Bob);
            await service.ChangeStatusAsync(taskId, 3,
                JsonDocument.Parse("""{"receipt":"INV-1"}""").RootElement, Carol);

            var back = await service.ChangeStatusAsync(taskId, 2,
                JsonDocument.Parse("""{"priceQuotes":["C","D"]}""").RootElement, Bob);
            Assert.True(back.IsSuccess);

            var forward = await service.ChangeStatusAsync(taskId, 3,
                JsonDocument.Parse("""{"receipt":"INV-2"}""").RootElement, Carol);
            Assert.True(forward.IsSuccess);
        }

        await using var verify = _fixture.CreateContext();
        var liveReceipt = await verify.TaskFieldValues
            .Include(v => v.Spec)
            .Where(v => v.TaskId == taskId && v.Spec.Name == "receipt" && v.IsDeleted == null)
            .FirstAsync();
        Assert.Equal("INV-2", liveReceipt.StringValue);
    }

    [Fact]
    public async Task ChangeStatusAsync_Returned_Entity_Maps_Without_Reloading_Spec_Navigation()
    {
        
        var registry = _services!.GetRequiredService<ITaskTypeRegistry>();
        var service = NewService(out var ctx);

        await using (ctx)
        {
            var created = await service.CreateAsync(1, Alice);
            var taskId = created.Value!.Id;

            var data = JsonDocument.Parse("""{"priceQuotes":["A","B"]}""").RootElement;
            var changed = await service.ChangeStatusAsync(taskId, newStatus: 2, data, Bob);
            Assert.True(changed.IsSuccess);

            var task = changed.Value!;
            var freshValues = task.FieldValues.Where(v => v.IsDeleted is null).ToList();
            Assert.Equal(2, freshValues.Count);
            Assert.All(freshValues, v => Assert.Null(v.Spec));

            var specsById = registry.Get(task.TaskTypeId).Statuses
                .SelectMany(s => s.Fields)
                .ToDictionary(f => f.Id, f => f);

            var dict = CustomDataWriter.Write(
                task.FieldValues.Where(v => v.IsDeleted is null).ToList(),
                specsById);

            Assert.True(dict.ContainsKey("priceQuotes"));
            var items = Assert.IsType<string[]>(dict["priceQuotes"]);
            Assert.Equal(["A", "B"], items);
        }
    }

    [Fact]
    public async Task ListAsync_Filters_By_User_And_GetByIdAsync_Returns_Field_Values_With_Spec()
    {
        var service = NewService(out var ctx);
        await using (ctx)
        {
            var bobTasks = await service.ListAsync(new TaskListFilters(UserId: Bob));
            Assert.NotEmpty(bobTasks);
            var procurement = bobTasks.First(t => t.TaskTypeId == 1 && t.Code == 2);

            var detail = await service.GetByIdAsync(procurement.Id);
            Assert.NotNull(detail);
            
            var pq = detail!.FieldValues
                .Where(v => v.StatusFieldSpecId == 1)
                .OrderBy(v => v.ItemIndex)
                .ToList();
            Assert.Equal(2, pq.Count);
            Assert.All(pq, v => Assert.NotNull(v.StringValue));
        }
    }

    private TaskService NewService(out AppDbContext db)
    {
        db = _fixture.CreateContext();
        return new TaskService(
            db,
            _services!.GetRequiredService<ITaskTypeRegistry>(),
            _services!.GetRequiredService<WorkflowEngine>(),
            _services!.GetRequiredService<TimeProvider>(),
            NullLogger<TaskService>.Instance);
    }
}
