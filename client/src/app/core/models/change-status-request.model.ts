/** POST /api/tasks/{id}/status body. Server decides direction; customData shape follows the target's field specs. */
export interface ChangeStatusRequest {
  /** Target status code — engine validates forward-by-one / rollback rules. */
  readonly newStatus: number;
  /** Assignee for the target status (server validates per-status assignee semantics). */
  readonly nextAssignedUserId: number;
  /** Per-status custom-data payload — shape dictated by StatusFieldSpecs; validated by CustomDataParser. */
  readonly customData: Readonly<Record<string, unknown>>;
}
