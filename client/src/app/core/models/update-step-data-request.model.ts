/** POST /api/tasks/{id}/steps body. Edits a status's data + assignee in place (no movement). */
export interface UpdateStepDataRequest {
  readonly status: number;
  readonly assignedUserId: number;
  readonly customData: Record<string, unknown>;
}
