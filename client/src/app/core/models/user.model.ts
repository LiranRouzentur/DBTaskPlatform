/** Seeded demo user from GET /api/users. No CRUD by design (assignment §2.2). */
export interface User {
  /** User id — referenced by `assignedUserId` on tasks and the user-filter sentinel. */
  readonly id: number;
  /** Display name shown in pickers and the assignee badge. */
  readonly fullName: string;
}
