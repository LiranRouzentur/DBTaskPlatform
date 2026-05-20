/** POST /api/tasks body. New tasks always start at status 1 — no status field required. */
export interface CreateTaskRequest {
  /** Which TaskType to instantiate; determines status definitions + field specs. */
  readonly taskTypeId: number;
  /** Assignee for the initial status (status 1). Validated server-side against the assignee rules. */
  readonly initialAssignedUserId: number;
}
