namespace TaskPlatform.Domain.Entities;

/// <summary>
/// Demo user. No auth, roles, or profile data — user management is out of scope.
/// </summary>
public sealed class User
{
    public int Id { get; private set; }
    public string FullName { get; private set; } = "";

    private User() { }

    public static User Seed(string fullName) => new()
    {
        FullName = fullName,
    };
}
