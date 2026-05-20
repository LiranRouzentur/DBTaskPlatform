// Wire shapes from /api/tasks. Mirror TaskPlatform.Api.Contracts. All fields readonly — the
// store mutates via patchState only.

/** Slim row for the task list. Detail (custom data + assignments) is fetched lazily on demand. */
export interface TaskListItem {
  readonly id: number;
  readonly taskTypeId: number;
  readonly status: number;
  readonly isClosed: boolean;
  readonly assignedUserId: number;
  readonly updatedAtUtc: string;
}

/** Full task projection. customData/assignee maps keyed by status code; retiredStatuses lists codes with soft-deleted data. */
export interface TaskDetail extends TaskListItem {
  readonly customDataByStatus: Readonly<Record<number, Readonly<Record<string, unknown>>>>;
  readonly assigneeByStatus: Readonly<Record<number, number>>;

  readonly retiredStatuses: readonly number[];
}
