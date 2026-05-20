import { StatusMetadata, TaskTypeMetadata } from '../../../core/models/task-type-metadata.model';
import { TaskListItem } from '../../../core/models/task.model';
import { User } from '../../../core/models/user.model';
import { formatAbsolute, formatRelativeTime } from '../../../core/utils/relative-time';
import { WorkflowValidators } from '../../../core/validators/workflow-validators.service';

// Row view-model. Pre-computes derived labels once per render; falls back to "Status N" /
// "Type N" for rows whose metadata hasn't loaded yet (avoids template-side crashes).

export interface RowView {
  readonly task: TaskListItem;
  readonly typeName: string;
  readonly typeId: number;
  readonly statuses: readonly StatusMetadata[];
  readonly currentStatusName: string;
  readonly assigneeName: string;
  readonly updatedRelative: string;
  readonly updatedAbsolute: string;
  readonly canClose: boolean;
}

export type SortKey = 'type' | 'status' | 'assignee' | 'updated';

export function toRowView(
  task: TaskListItem,
  type: TaskTypeMetadata | undefined,
  userById: ReadonlyMap<number, User>,
): RowView {
  const statusDef = type?.statuses.find((s) => s.status === task.status);
  const assignee = userById.get(task.assignedUserId);
  return {
    task,
    typeName: type?.name ?? `Type ${task.taskTypeId}`,
    typeId: task.taskTypeId,
    statuses: type?.statuses ?? [],
    currentStatusName: statusDef?.name ?? `Status ${task.status}`,
    assigneeName: assignee?.fullName ?? '—',
    updatedRelative: formatRelativeTime(task.updatedAtUtc),
    updatedAbsolute: formatAbsolute(task.updatedAtUtc),
    canClose: type ? WorkflowValidators.canClose(task, type).ok : false,
  };
}

export function compareRows(a: RowView, b: RowView, key: SortKey): number {
  switch (key) {
    case 'type':
      return a.typeName.localeCompare(b.typeName);
    case 'status': {
      const byNum = a.task.status - b.task.status;
      return byNum !== 0 ? byNum : a.currentStatusName.localeCompare(b.currentStatusName);
    }
    case 'assignee':
      return a.assigneeName.localeCompare(b.assigneeName);
    case 'updated':
      return Date.parse(a.task.updatedAtUtc) - Date.parse(b.task.updatedAtUtc);
  }
}
