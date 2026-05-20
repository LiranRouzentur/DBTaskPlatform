// Wire shapes from /api/tasks. Mirror TaskPlatform.Api.Contracts. All fields readonly — the
// store mutates via patchState only.

/** Slim row for the task list. Detail (custom data + assignments) is fetched lazily on demand. */
export interface TaskListItem {
  /** Task id. */
  readonly id: number;
  /** Which TaskType this row belongs to — looked up via TasksStore.taskTypeById. */
  readonly taskTypeId: number;
  /** Current status code (the active step of the workflow). */
  readonly status: number;
  /** True once the task has reached its terminal status (immutable thereafter — project.md §4). */
  readonly isClosed: boolean;
  /** Current-status assignee — drives the "Assigned to" column. */
  readonly assignedUserId: number;
  /** ISO timestamp of the last write; surface "Updated" column and sort key. */
  readonly updatedAtUtc: string;
}

/** Full task projection. customData/assignee maps keyed by status code; retiredStatuses lists codes with soft-deleted data. */
export interface TaskDetail extends TaskListItem {
  /** Per-status custom-data snapshot: `{ [statusCode]: { [fieldName]: value } }`. */
  readonly customDataByStatus: Readonly<Record<number, Readonly<Record<string, unknown>>>>;
  /** Per-status assignee history — change-status modal pre-fills from this when rolling back. */
  readonly assigneeByStatus: Readonly<Record<number, number>>;

  /** Status codes whose customData was soft-deleted (rollback past a step) — surfaced as "retired" in the UI. */
  readonly retiredStatuses: readonly number[];
}
