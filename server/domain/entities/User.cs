namespace TaskPlatform.Domain.Entities;

/// <summary>
/// Demo user. No auth, roles, or profile data — user management is out of scope.
/// </summary>
// Minimal user entity used purely as an FK target for task assignment. Intentionally feature-poor.
public sealed class User
{
    // Surrogate PK assigned by the database on INSERT.
    public int Id { get; private set; }
    // Display name shown in pickers / detail views. Empty-string default ensures the property is
    // never observed as null even before EF materializes a row.
    public string FullName { get; private set; } = "";

    // Private parameterless constructor for EF materialization only.
    private User() { }

    // Seed-only factory. DatabaseSeeder uses this to populate demo users on a fresh DB.
    public static User Seed(
        // Display name for the seeded user.
        string fullName) => new()
    {
        FullName = fullName,
    };
}
