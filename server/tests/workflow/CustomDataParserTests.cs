using System.Text.Json;
using TaskPlatform.Application.Mapping;
using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Tests.Workflow;

public class CustomDataParserTests
{
    private static readonly TaskType Procurement = TestTaskTypes.Procurement();
    private static readonly TaskType Development = TestTaskTypes.Development();

    private static StatusDefinition Proc(int code) =>
        Procurement.Statuses.Single(s => s.Code == code);
    private static StatusDefinition Dev(int code) =>
        Development.Statuses.Single(s => s.Code == code);

    [Fact]
    public void Parse_Status_1_With_Empty_Body_Succeeds()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(1), Json("{}"));

        Assert.True(result.Validation.IsValid);
        Assert.Empty(result.Validation.Errors);
        Assert.Empty(result.Values);
    }

    [Fact]
    public void Parse_Status_1_With_Undefined_Body_Succeeds()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(1), default);

        Assert.True(result.Validation.IsValid);
    }

    [Fact]
    public void Parse_Required_String_Missing_Returns_Required()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json("{}"));

        Assert.False(result.Validation.IsValid);
        Assert.True(result.Validation.Errors.ContainsKey("receipt"));
        Assert.Contains("This field is required.", result.Validation.Errors["receipt"]);
    }

    [Fact]
    public void Parse_Required_String_Empty_Returns_Required()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json("""{"receipt":""}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains("This field is required.", result.Validation.Errors["receipt"]);
    }

    [Fact]
    public void Parse_Required_String_Whitespace_Returns_Required()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json("""{"receipt":"   "}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains("This field is required.", result.Validation.Errors["receipt"]);
    }

    [Fact]
    public void Parse_Required_String_Wrong_Kind_Returns_Kind_Error()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json("""{"receipt":42}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains(result.Validation.Errors["receipt"], m => m.Contains("Must be a string"));
    }

    [Fact]
    public void Parse_Required_String_Valid_Succeeds_And_Emits_Value()
    {
        var result = CustomDataParser.Parse(taskId: 7, Proc(3), Json("""{"receipt":"INV-001"}"""));

        Assert.True(result.Validation.IsValid);
        var value = Assert.Single(result.Values);
        Assert.Equal(7, value.TaskId);
        Assert.Equal(Proc(3).Fields.Single(f => f.Name == "receipt").Id, value.StatusFieldSpecId);
        Assert.Equal("INV-001", value.StringValue);
        Assert.Equal(1, value.ItemIndex);
    }

    [Fact]
    public void Parse_MultiValue_Missing_Returns_Required()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(2), Json("{}"));

        Assert.False(result.Validation.IsValid);
        Assert.True(result.Validation.Errors.ContainsKey("priceQuotes"));
        Assert.Contains("This field is required.", result.Validation.Errors["priceQuotes"]);
    }

    [Fact]
    public void Parse_MultiValue_Below_ItemCount_Reports_Exact_Count()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(2), Json("""{"priceQuotes":["one"]}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains(result.Validation.Errors["priceQuotes"], m => m.Contains("exactly 2"));
    }

    [Fact]
    public void Parse_MultiValue_Above_ItemCount_Reports_Exact_Count()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(2), Json("""{"priceQuotes":["a","b","c"]}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains(result.Validation.Errors["priceQuotes"], m => m.Contains("exactly 2"));
    }

    [Fact]
    public void Parse_MultiValue_Not_An_Array_Reports_Kind_Error()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(2), Json("""{"priceQuotes":"not-an-array"}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains(result.Validation.Errors["priceQuotes"], m => m.Contains("array"));
    }

    [Fact]
    public void Parse_MultiValue_NonString_Item_Reports_Per_Item()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(2), Json("""{"priceQuotes":["ok",42]}"""));

        Assert.False(result.Validation.IsValid);
        Assert.Contains(result.Validation.Errors["priceQuotes"], m => m.Contains("Item 2") && m.Contains("Must be a string"));
    }

    [Fact]
    public void Parse_MultiValue_Exact_Count_Succeeds_And_Emits_N_Rows()
    {
        var result = CustomDataParser.Parse(taskId: 11, Proc(2), Json("""{"priceQuotes":["a","b"]}"""));

        Assert.True(result.Validation.IsValid);
        Assert.Equal(2, result.Values.Count);
        var specId = Proc(2).Fields.Single(f => f.Name == "priceQuotes").Id;
        Assert.All(result.Values, v => Assert.Equal(specId, v.StatusFieldSpecId));
        Assert.Equal(new[] { "a", "b" }, result.Values.OrderBy(v => v.ItemIndex).Select(v => v.StringValue).ToArray());
        Assert.Equal(new[] { 1, 2 }, result.Values.OrderBy(v => v.ItemIndex).Select(v => v.ItemIndex).ToArray());
    }

    [Fact]
    public void Parse_String_Length_Below_Min_Reports_Min_Violation()
    {
        
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json("""{"receipt":""}"""));
        Assert.False(result.Validation.IsValid);
        Assert.Contains("This field is required.", result.Validation.Errors["receipt"]);
    }

    [Fact]
    public void Parse_String_Length_Above_Max_Reports_Max_Violation()
    {
        var longString = new string('x', 200);
        var json = $$"""{"receipt":"{{longString}}"}""";
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json(json));

        Assert.False(result.Validation.IsValid);
        Assert.Contains(result.Validation.Errors["receipt"], m => m.Contains("at most 150"));
    }

    [Fact]
    public void Parse_Development_Status_2_Requires_Specification()
    {
        var result = CustomDataParser.Parse(taskId: 0, Dev(2), Json("{}"));

        Assert.False(result.Validation.IsValid);
        Assert.True(result.Validation.Errors.ContainsKey("specification"));
    }

    [Fact]
    public void Parse_Development_All_Statuses_Accept_Valid_Data()
    {
        foreach (var (code, json) in new[]
        {
            (2, """{"specification":"spec"}"""),
            (3, """{"branchName":"feat/x"}"""),
            (4, """{"versionNumber":"1.0.0"}"""),
        })
        {
            var result = CustomDataParser.Parse(taskId: 0, Dev(code), Json(json));
            Assert.True(result.Validation.IsValid, $"Status {code} should be valid but failed.");
        }
    }

    [Fact]
    public void Parse_Failure_Returns_Empty_Values_List()
    {
        var result = CustomDataParser.Parse(taskId: 0, Proc(3), Json("{}"));

        Assert.False(result.Validation.IsValid);
        Assert.Empty(result.Values);
    }

    private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement;
}
