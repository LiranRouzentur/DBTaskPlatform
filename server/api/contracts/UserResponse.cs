namespace TaskPlatform.Api.Contracts;

// Slim user projection for the assignee picker — only id + full name; no contact info exposed.
public sealed record UserResponse(
    // Surrogate key of the User row, used everywhere as the AssignedUserId on tasks.
    int Id,
    // Display string for the picker UI (already pre-formatted server-side).
    string FullName);
