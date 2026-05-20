import { StatusMetadata, TaskTypeMetadata } from '../../../core/models/task-type-metadata.model';
import { TaskListItem } from '../../../core/models/task.model';
import { User } from '../../../core/models/user.model';
import { formatAbsolute, formatRelativeTime } from '../../../core/utils/relative-time';
import { WorkflowValidators } from '../../../core/validators/workflow-validators.service';

// Row view-model. Pre-computes derived labels once per render; falls back to "Status N" /
// "Type N" for rows whose metadata hasn't loaded yet (avoids template-side crashes).

/** Per-row view-model — keeps templates declarative and OnPush-friendly (no method calls in bindings). */
export interface RowView {
  /** Raw task list item from the API — kept attached so handlers can pass `row.task` back to the store. */
  readonly task: TaskListItem;
  /** Resolved type name (e.g. "Procurement"); falls back to "Type N" when metadata is missing. */
  readonly typeName: string;
  /** Numeric task-type id used by `taskTypeTone` to colour the badge. */
  readonly typeId: number;
  /** Pre-resolved status definitions for the type — passed straight to the stepper component. */
  readonly statuses: readonly StatusMetadata[];
  /** Human name of the task's current status. */
  readonly currentStatusName: string;
  /** Resolved assignee full name; em-dash placeholder when missing. */
  readonly assigneeName: string;
  /** Human "5 minutes ago" string for `updatedAtUtc`. */
  readonly updatedRelative: string;
  /** Absolute timestamp used as tooltip on the relative time label. */
  readonly updatedAbsolute: string;
  /** True when the task may be closed from the row — gates the inline close icon-button. */
  readonly canClose: boolean;
}

/** Allowed sort keys for the task-list table; column headers reuse these strings. */
export type SortKey = 'type' | 'status' | 'assignee' | 'updated';

/** Projects a raw TaskListItem + lookup maps into the row view-model the template consumes. */
export function toRowView(
  task: TaskListItem,
  type: TaskTypeMetadata | undefined,
  userById: ReadonlyMap<number, User>,
): RowView {
  // Look up the current StatusDefinition for the row — may be missing if metadata is still loading.
  const statusDef = type?.statuses.find((s) => s.status === task.status);
  // Resolve the assignee via the O(1) map maintained in the store.
  const assignee = userById.get(task.assignedUserId);
  return {
    task,
    // `Type N` fallback keeps the row renderable even before task-types metadata loads.
    typeName: type?.name ?? `Type ${task.taskTypeId}`,
    typeId: task.taskTypeId,
    // Empty statuses array drives the stepper component to render no segments rather than crashing.
    statuses: type?.statuses ?? [],
    // Same fallback strategy as typeName so the row's status column always has text.
    currentStatusName: statusDef?.name ?? `Status ${task.status}`,
    // Em-dash placeholder communicates "unknown" more clearly than an empty string.
    assigneeName: assignee?.fullName ?? '—',
    // Humanised "5 minutes ago" string; the absolute timestamp below feeds the tooltip.
    updatedRelative: formatRelativeTime(task.updatedAtUtc),
    updatedAbsolute: formatAbsolute(task.updatedAtUtc),
    // Without metadata we conservatively gate the close button off — server is the authoritative check anyway.
    canClose: type ? WorkflowValidators.canClose(task, type).ok : false,
  };
}

/** Stable per-key comparator for the table sort; `status` ties break on the human name for predictability. */
export function compareRows(a: RowView, b: RowView, key: SortKey): number {
  switch (key) {
    case 'type':
      // Alphabetical by type name — locale-aware so accented characters sort correctly.
      return a.typeName.localeCompare(b.typeName);
    case 'status': {
      // Numeric status first — preserves workflow ordering (Draft < In review < Done, etc).
      const byNum = a.task.status - b.task.status;
      // Equal numeric status (rare across types) → tie-break on the human name for stability.
      return byNum !== 0 ? byNum : a.currentStatusName.localeCompare(b.currentStatusName);
    }
    case 'assignee':
      // Alphabetical by assignee name — matches user-picker ordering.
      return a.assigneeName.localeCompare(b.assigneeName);
    case 'updated':
      // Numeric timestamp delta — negative = a older, positive = a newer; descending later flips this.
      return Date.parse(a.task.updatedAtUtc) - Date.parse(b.task.updatedAtUtc);
  }
}
