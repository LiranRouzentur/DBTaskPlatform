namespace TaskPlatform.Api.Contracts;

/// <summary>
/// Wire shape of /api/task-types. <c>Kind</c> is the StatusFieldKind enum stringified ("String"/"Number").
/// </summary>
public sealed record TaskTypeMetadataResponse(
    int Id,
    string Name,
    int FinalStatus,
    IReadOnlyList<StatusMetadataResponse> Statuses);

public sealed record StatusMetadataResponse(
    int Status,
    string Name,
    IReadOnlyList<FieldSpecMetadataResponse> Fields);

public sealed record FieldSpecMetadataResponse(
    string Name,
    string Kind,
    int ItemCount,
    int? Min,
    int? Max);
