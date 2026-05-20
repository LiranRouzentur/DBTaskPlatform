/** POST /api/tasks/{id}/status body. Server decides direction; customData shape follows the target's field specs. */
export interface ChangeStatusRequest {
  readonly newStatus: number;
  readonly nextAssignedUserId: number;
  readonly customData: Readonly<Record<string, unknown>>;
}
