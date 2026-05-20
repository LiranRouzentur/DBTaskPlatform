using TaskPlatform.Domain.Workflow;

namespace TaskPlatform.Tests.Workflow;

internal static class TestTaskTypes
{
    public const int ProcurementId = 1;
    public const int DevelopmentId = 2;

    public const int ProcStatus1Id = 1;
    public const int ProcStatus2Id = 2;
    public const int ProcStatus3Id = 3;
    public const int DevStatus1Id = 4;
    public const int DevStatus2Id = 5;
    public const int DevStatus3Id = 6;
    public const int DevStatus4Id = 7;

    public const int SpecPriceQuotesId = 1;
    public const int SpecReceiptId = 2;
    public const int SpecSpecificationId = 3;
    public const int SpecBranchNameId = 4;
    public const int SpecVersionNumberId = 5;

    public static TaskType Procurement() => TaskType.Seed(
        ProcurementId,
        "Procurement",
        statuses:
        [
            StatusDefinition.Seed(ProcStatus1Id, ProcurementId, code: 1, "Created", position: 1, isFinal: false, fields: []),
            StatusDefinition.Seed(ProcStatus2Id, ProcurementId, code: 2, "Supplier offers received", position: 2, isFinal: false, fields:
            [
                StatusFieldSpec.Seed(SpecPriceQuotesId, "priceQuotes", StatusFieldKind.String, itemCount: 2, position: 1, min: 1, max: 150),
            ]),
            StatusDefinition.Seed(ProcStatus3Id, ProcurementId, code: 3, "Purchase completed", position: 3, isFinal: true, fields:
            [
                StatusFieldSpec.Seed(SpecReceiptId, "receipt", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
            ]),
        ]);

    public static TaskType Development() => TaskType.Seed(
        DevelopmentId,
        "Development",
        statuses:
        [
            StatusDefinition.Seed(DevStatus1Id, DevelopmentId, code: 1, "Created", position: 1, isFinal: false, fields: []),
            StatusDefinition.Seed(DevStatus2Id, DevelopmentId, code: 2, "Specification completed", position: 2, isFinal: false, fields:
            [
                StatusFieldSpec.Seed(SpecSpecificationId, "specification", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
            ]),
            StatusDefinition.Seed(DevStatus3Id, DevelopmentId, code: 3, "Development completed", position: 3, isFinal: false, fields:
            [
                StatusFieldSpec.Seed(SpecBranchNameId, "branchName", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
            ]),
            StatusDefinition.Seed(DevStatus4Id, DevelopmentId, code: 4, "Distribution completed", position: 4, isFinal: true, fields:
            [
                StatusFieldSpec.Seed(SpecVersionNumberId, "versionNumber", StatusFieldKind.String, itemCount: 1, position: 1, min: 1, max: 150),
            ]),
        ]);
}
