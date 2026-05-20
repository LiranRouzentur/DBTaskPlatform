import { TaskListItem } from '../models/task.model';
import { TaskTypeMetadata } from '../models/task-type-metadata.model';

// Client mirror of the server's WorkflowEngine rules. The WorkflowRule union below MUST stay
// in sync with backend WorkflowError.Rule keys (kebab-case, centralised in server's ProblemTypes —
// see project rules §2 and frontend rules §4). Defence-in-depth: UI gates AND server validates.
// Plain const-object (not @Injectable) — every consumer needs the same value, no DI swap.

/** Local alias — only the list-item fields are needed for workflow checks. */
type Task = TaskListItem;

/** Result of a workflow check; `ok: true` carries no rule/message, failures carry both. */
export interface WorkflowCheck {
  /** True when the action is permitted; false otherwise. */
  readonly ok: boolean;
  /** kebab-case rule key mirroring the server's `ProblemDetails.rule` extension (see project.md §2). */
  readonly rule?: WorkflowRule;
  /** Human-readable explanation used in toasts and inline form errors. */
  readonly message?: string;
}

/** kebab-case rule keys; MUST mirror server `WorkflowError.Rule` values verbatim — adding one here
 *  without adding it on the server (or vice-versa) breaks the contract surface. */
export type WorkflowRule =
  | 'closed-immutable'
  | 'no-movement'
  | 'invalid-status'
  | 'no-forward-skip'
  | 'beyond-final'
  | 'not-at-final'
  | 'already-closed'
  | 'invalid-next-user';

/** Shared success sentinel — reused to avoid allocating a new object on every passing check. */
const OK: WorkflowCheck = { ok: true };

/** Tiny constructor for failure cases — keeps call sites a single readable line. */
function fail(rule: WorkflowRule, message: string): WorkflowCheck {
  return { ok: false, rule, message };
}

/** Workflow rule mirror used by the change-status modal and submit-gating. Server remains authoritative. */
export const WorkflowValidators = {

  /** Validates a forward-by-one or any-backward status move against the task type's final-status bound. */
  canChangeStatus(
    task: Task,
    targetStatus: number,
    type: TaskTypeMetadata,
  ): WorkflowCheck {
    if (task.isClosed) {
      return fail('closed-immutable', 'Closed tasks are immutable.');
    }
    if (targetStatus === task.status) {
      return fail('no-movement', 'Target status equals current status.');
    }
    if (targetStatus < 1 || !Number.isInteger(targetStatus)) {
      return fail('invalid-status', 'Status must be a positive integer.');
    }
    if (targetStatus > task.status + 1) {
      return fail(
        'no-forward-skip',
        `Forward moves must be sequential (current ${task.status}, attempted ${targetStatus}).`,
      );
    }
    if (targetStatus > type.finalStatus) {
      return fail(
        'beyond-final',
        `Status ${targetStatus} is beyond the final status (${type.finalStatus}).`,
      );
    }
    return OK;
  },

  /** Gate for the "Close" button — only valid when the task is at its type's final status. */
  canClose(task: Task, type: TaskTypeMetadata): WorkflowCheck {
    if (task.isClosed) {
      return fail('already-closed', 'Task is already closed.');
    }
    if (task.status !== type.finalStatus) {
      return fail(
        'not-at-final',
        `Task can only be closed at final status ${type.finalStatus} (current ${task.status}).`,
      );
    }
    return OK;
  },

  /** Lightweight predicate for the assignee picker; the server enforces the actual existence check. */
  isAssigneeValid(userId: number | null | undefined): boolean {
    return typeof userId === 'number' && Number.isInteger(userId) && userId > 0;
  },

  /** Enumerates legal target statuses (forward-by-one + any earlier status). Drives the picker options. */
  validTargets(task: Task, type: TaskTypeMetadata): readonly number[] {
    if (task.isClosed) return [];
    const backward: number[] = [];
    for (let s = 1; s < task.status; s++) backward.push(s);
    const forward: number[] = task.status < type.finalStatus ? [task.status + 1] : [];
    return [...forward, ...backward];
  },
} as const;
