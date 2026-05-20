/** POST /api/tasks/{id}/steps body. Edits a status's data + assignee in place (no movement). */
export interface UpdateStepDataRequest {
  /** Which status row to edit — must match the task's current status (server rejects otherwise). */
  readonly status: number;
  /** New assignee for this status. */
  readonly assignedUserId: number;
  /** Updated custom-data payload — re-validated against the status's field specs. */
  readonly customData: Record<string, unknown>;
}
