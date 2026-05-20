/** POST /api/tasks body. New tasks always start at status 1 — no status field required. */
export interface CreateTaskRequest {
  readonly taskTypeId: number;
  readonly initialAssignedUserId: number;
}
