using System.Text.Json;
using TaskPlatform.Application.Workflow;
using TaskPlatform.Domain.Entities;
using TaskPlatform.Domain.Errors;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Tests.Workflow;

public class WorkflowEngineTests
{
    private const int Assignee = 1;
    private const int NextAssignee = 2;
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static IEnumerable<object[]> AllTaskTypes() => new[]
    {
        new object[] { TestTaskTypes.Procurement() },
        new object[] { TestTaskTypes.Development() },
    };

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_Forward_By_One_With_Valid_Data_Succeeds(TaskType type)
    {
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 2, Json(ValidDataFor(type, 2)), NextAssignee, Now);

        Assert.True(outcome.IsSuccess);
        Assert.Equal(2, task.Code);
        Assert.Equal(NextAssignee, task.CurrentAssignedUserId);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_Forward_Skip_Returns_NoForwardSkip(TaskType type)
    {
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 3, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.NoForwardSkip>(outcome.Error);
        Assert.Equal(1, err.Current);
        Assert.Equal(3, err.Attempted);
        Assert.Equal("no-forward-skip", err.Rule);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_Backward_By_One_Succeeds(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 1, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsSuccess);
        Assert.Equal(1, task.Code);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_Backward_To_Status_1_From_FinalStatus_Succeeds(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 1, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsSuccess);
        Assert.Equal(1, task.Code);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_To_Zero_Returns_InvalidStatus(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 0, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.InvalidStatus>(outcome.Error);
        Assert.Equal(0, err.Attempted);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_To_Negative_Returns_InvalidStatus(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, -1, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.InvalidStatus>(outcome.Error);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_Forward_Beyond_FinalStatus_Returns_BeyondFinal(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, type.FinalStatusCode + 1, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.BeyondFinal>(outcome.Error);
        Assert.Equal(type.FinalStatusCode + 1, err.Attempted);
        Assert.Equal(type.FinalStatusCode, err.Final);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_With_Empty_NextUser_Returns_InvalidNextUser(TaskType type)
    {
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 2, Json(ValidDataFor(type, 2)), 0, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.InvalidNextUser>(outcome.Error);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_With_Missing_Required_Field_Returns_InvalidData(TaskType type)
    {
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 2, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.InvalidData>(outcome.Error);
        Assert.NotEmpty(err.Errors);
    }

    [Fact]
    public void ChangeStatus_Procurement_Status2_With_Too_Few_Quotes_Returns_InvalidData()
    {
        var type = TestTaskTypes.Procurement();
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 2, Json("""{"priceQuotes":["only one"]}"""), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.InvalidData>(outcome.Error);
        Assert.True(err.Errors.ContainsKey("priceQuotes"));
        Assert.Contains(err.Errors["priceQuotes"], m => m.Contains("exactly 2"));
    }

    [Fact]
    public void ChangeStatus_Procurement_Status2_With_Too_Many_Quotes_Returns_InvalidData()
    {
        var type = TestTaskTypes.Procurement();
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 2, Json("""{"priceQuotes":["a","b","c"]}"""), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.InvalidData>(outcome.Error);
        Assert.Contains(err.Errors["priceQuotes"], m => m.Contains("exactly 2"));
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_On_Closed_Task_Returns_ClosedImmutable(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode, isClosed: true);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 1, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.ClosedImmutable>(outcome.Error);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void ChangeStatus_To_Current_Returns_NoMovement(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.ChangeStatus(task, 2, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.NoMovement>(outcome.Error);
    }

    [Fact]
    public void ChangeStatus_Forward_Retains_PriorStage_FieldValues_As_History()
    {
        var type = TestTaskTypes.Procurement();
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        var first = engine.ChangeStatus(task, 2, Json("""{"priceQuotes":["a","b"]}"""), NextAssignee, Now);
        Assert.True(first.IsSuccess);
        
        Assert.Equal(2, task.FieldValues.Count);
        Assert.All(task.FieldValues, v => Assert.Equal(TestTaskTypes.SpecPriceQuotesId, v.StatusFieldSpecId));

        var laterNow = Now.AddMinutes(5);
        var second = engine.ChangeStatus(task, 3, Json("""{"receipt":"INV-1"}"""), Assignee, laterNow);
        Assert.True(second.IsSuccess);
        
        Assert.Equal(3, task.FieldValues.Count);

        var quoteRows = task.FieldValues
            .Where(v => v.StatusFieldSpecId == TestTaskTypes.SpecPriceQuotesId)
            .OrderBy(v => v.ItemIndex)
            .ToList();
        Assert.Equal(2, quoteRows.Count);
        Assert.Equal(new[] { "a", "b" }, quoteRows.Select(v => v.StringValue).ToArray());

        var receipt = task.FieldValues.Single(v => v.StatusFieldSpecId == TestTaskTypes.SpecReceiptId);
        Assert.Equal(TestTaskTypes.SpecReceiptId, receipt.StatusFieldSpecId);
        Assert.Equal("INV-1", receipt.StringValue);
        Assert.Equal(laterNow, task.UpdatedAtUtc);
    }

    [Fact]
    public void ChangeStatus_Backward_SoftDeletes_HistoryAbove_Target()
    {
        var type = TestTaskTypes.Procurement();
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        engine.ChangeStatus(task, 2, Json("""{"priceQuotes":["a","b"]}"""), NextAssignee, Now);
        engine.ChangeStatus(task, 3, Json("""{"receipt":"INV-1"}"""), Assignee, Now.AddMinutes(1));

        var back = engine.ChangeStatus(task, 2, Json("""{"priceQuotes":["c","d"]}"""), NextAssignee, Now.AddMinutes(2));
        Assert.True(back.IsSuccess);
        Assert.Equal(2, task.Code);

        Assert.Equal(3, task.FieldValues.Count);

        var quoteRows = task.FieldValues
            .Where(v => v.StatusFieldSpecId == TestTaskTypes.SpecPriceQuotesId)
            .OrderBy(v => v.ItemIndex)
            .ToList();
        Assert.Equal(2, quoteRows.Count);
        Assert.All(quoteRows, q => Assert.Null(q.IsDeleted));
        Assert.Equal(new[] { "c", "d" }, quoteRows.Select(q => q.StringValue).ToArray());

        var receiptHistory = task.FieldValues.Single(v => v.StatusFieldSpecId == TestTaskTypes.SpecReceiptId);
        Assert.True(receiptHistory.IsDeleted);
        Assert.Equal("INV-1", receiptHistory.StringValue);

        Assert.Equal(2, task.Assignments.Count);
        Assert.Contains(task.Assignments, a => a.StatusDefinitionId == TestTaskTypes.ProcStatus1Id);
        Assert.Contains(task.Assignments, a => a.StatusDefinitionId == TestTaskTypes.ProcStatus2Id);
        Assert.DoesNotContain(task.Assignments, a => a.StatusDefinitionId == TestTaskTypes.ProcStatus3Id);
    }

    [Fact]
    public void ChangeStatus_Records_Assignment_Snapshot_Per_Status()
    {
        var type = TestTaskTypes.Procurement();
        var task = TaskItem.Create(type, Assignee, Now);
        var engine = MakeEngine(type);

        engine.ChangeStatus(task, 2, Json("""{"priceQuotes":["a","b"]}"""), NextAssignee, Now);

        Assert.Equal(2, task.Assignments.Count);
        Assert.Equal(Assignee, task.Assignments.Single(a => a.StatusDefinitionId == TestTaskTypes.ProcStatus1Id).AssignedUserId);
        Assert.Equal(NextAssignee, task.Assignments.Single(a => a.StatusDefinitionId == TestTaskTypes.ProcStatus2Id).AssignedUserId);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void Close_At_FinalStatus_Succeeds(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode);
        var engine = MakeEngine(type);

        var outcome = engine.Close(task, Now);

        Assert.True(outcome.IsSuccess);
        Assert.True(task.IsClosed);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void Close_Before_FinalStatus_Returns_NotAtFinal(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode - 1);
        var engine = MakeEngine(type);

        var outcome = engine.Close(task, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.NotAtFinal>(outcome.Error);
        Assert.Equal(type.FinalStatusCode - 1, err.Current);
        Assert.Equal(type.FinalStatusCode, err.Final);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void Close_Already_Closed_Returns_AlreadyClosed(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode, isClosed: true);
        var engine = MakeEngine(type);

        var outcome = engine.Close(task, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.AlreadyClosed>(outcome.Error);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void UpdateStepData_Current_Step_Succeeds_And_Refreshes_Live_Assignee(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.UpdateStepData(task, 2, Json(ValidDataFor(type, 2)), NextAssignee, Now);

        Assert.True(outcome.IsSuccess);
        Assert.Equal(2, task.Code);
        Assert.Equal(NextAssignee, task.CurrentAssignedUserId);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void UpdateStepData_Prior_Step_Succeeds_And_Leaves_Live_Assignee(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);
        var originalAssignee = task.CurrentAssignedUserId;

        var outcome = engine.UpdateStepData(task, 1, Json(ValidDataFor(type, 1)), NextAssignee, Now);

        Assert.True(outcome.IsSuccess);
        Assert.Equal(2, task.Code);
        Assert.Equal(originalAssignee, task.CurrentAssignedUserId);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void UpdateStepData_Future_Step_Returns_InvalidStatus(TaskType type)
    {
        var task = SeedAt(type, code: 1);
        var engine = MakeEngine(type);

        var outcome = engine.UpdateStepData(task, 2, Json(ValidDataFor(type, 2)), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        var err = Assert.IsType<WorkflowError.InvalidStatus>(outcome.Error);
        Assert.Equal(2, err.Attempted);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void UpdateStepData_On_Closed_Task_Returns_ClosedImmutable(TaskType type)
    {
        var task = SeedAt(type, code: type.FinalStatusCode, isClosed: true);
        var engine = MakeEngine(type);

        var outcome = engine.UpdateStepData(task, type.FinalStatusCode, Json(ValidDataFor(type, type.FinalStatusCode)), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.ClosedImmutable>(outcome.Error);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void UpdateStepData_Invalid_CustomData_Returns_InvalidData(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.UpdateStepData(task, 2, Json("{}"), NextAssignee, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.InvalidData>(outcome.Error);
    }

    [Theory]
    [MemberData(nameof(AllTaskTypes))]
    public void UpdateStepData_Zero_AssignedUserId_Returns_InvalidNextUser(TaskType type)
    {
        var task = SeedAt(type, code: 2);
        var engine = MakeEngine(type);

        var outcome = engine.UpdateStepData(task, 2, Json(ValidDataFor(type, 2)), 0, Now);

        Assert.True(outcome.IsFailure);
        Assert.IsType<WorkflowError.InvalidNextUser>(outcome.Error);
    }

    [Fact]
    public void Engine_Has_No_TaskType_Conditionals_Verified_By_Working_With_Two_Types()
    {
        var procurement = TestTaskTypes.Procurement();
        var development = TestTaskTypes.Development();
        var engine = MakeEngine(procurement, development);

        var p = TaskItem.Create(procurement, Assignee, Now);
        var d = TaskItem.Create(development, Assignee, Now);

        Assert.True(engine.ChangeStatus(p, 2, Json("""{"priceQuotes":["a","b"]}"""), NextAssignee, Now).IsSuccess);
        Assert.True(engine.ChangeStatus(d, 2, Json("""{"specification":"spec"}"""), NextAssignee, Now).IsSuccess);
    }

    private static WorkflowEngine MakeEngine(params TaskType[] types) =>
        new(new FakeTaskTypeRegistry(types));

    private static TaskItem SeedAt(TaskType type, int code, bool isClosed = false)
    {
        var status = type.Statuses.Single(s => s.Code == code);
        return TaskItem.SeedNew(type.Id, status, isClosed, Assignee, Now, Now);
    }

    private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement;

    private static string ValidDataFor(TaskType type, int code)
    {
        var fields = type.Statuses.First(s => s.Code == code).Fields;
        var parts = fields.Select(f => (f.Kind, f.ItemCount) switch
        {
            (StatusFieldKind.String, 1) => $"\"{f.Name}\":\"value\"",
            (StatusFieldKind.Number, 1) => $"\"{f.Name}\":1",
            (StatusFieldKind.String, var n) => $"\"{f.Name}\":[{string.Join(",", Enumerable.Range(0, n).Select(_ => "\"v\""))}]",
            (StatusFieldKind.Number, var n) => $"\"{f.Name}\":[{string.Join(",", Enumerable.Range(1, n))}]",
            _ => throw new NotSupportedException($"Kind {f.Kind} not handled in test helper."),
        });
        return "{" + string.Join(",", parts) + "}";
    }
}
