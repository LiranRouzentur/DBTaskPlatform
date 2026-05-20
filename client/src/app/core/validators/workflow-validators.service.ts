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
  // Always `ok: false` here — rule + message are required on the failure shape.
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
    // Closed tasks are immutable per requirements §4 — earliest exit so other checks never run on dead tasks.
    if (task.isClosed) {
      return fail('closed-immutable', 'Closed tasks are immutable.');
    }
    // Reject no-op moves — the server treats this as `no-movement`; mirroring it disables the submit button.
    if (targetStatus === task.status) {
      return fail('no-movement', 'Target status equals current status.');
    }
    // Domain invariant: status ids are positive integers; floats or zero are malformed.
    if (targetStatus < 1 || !Number.isInteger(targetStatus)) {
      return fail('invalid-status', 'Status must be a positive integer.');
    }
    // Forward moves must be sequential (status+1 only); arbitrary backward jumps are still allowed.
    if (targetStatus > task.status + 1) {
      return fail(
        'no-forward-skip',
        `Forward moves must be sequential (current ${task.status}, attempted ${targetStatus}).`,
      );
    }
    // Can't move past the type's final status — the close action is the only way out of it.
    if (targetStatus > type.finalStatus) {
      return fail(
        'beyond-final',
        `Status ${targetStatus} is beyond the final status (${type.finalStatus}).`,
      );
    }
    // All gates passed — reuse the shared OK sentinel to avoid an allocation per check.
    return OK;
  },

  /** Gate for the "Close" button — only valid when the task is at its type's final status. */
  canClose(task: Task, type: TaskTypeMetadata): WorkflowCheck {
    // Already-closed gets a distinct rule so the toast wording can differ from generic "closed-immutable".
    if (task.isClosed) {
      return fail('already-closed', 'Task is already closed.');
    }
    // Close is only legal at the final status — closing earlier would silently skip remaining steps.
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
    // Triple guard: shape (number), integrity (integer), positivity (>0). Server still does the existence check.
    return typeof userId === 'number' && Number.isInteger(userId) && userId > 0;
  },

  /** Enumerates legal target statuses (forward-by-one + any earlier status). Drives the picker options. */
  validTargets(task: Task, type: TaskTypeMetadata): readonly number[] {
    // Closed tasks have no legal targets — empty list disables the picker entirely.
    if (task.isClosed) return [];
    // Collect every prior status (1..status-1) — backward moves are unrestricted.
    const backward: number[] = [];
    for (let s = 1; s < task.status; s++) backward.push(s);
    // Single forward option (status+1), but only if we haven't already hit the final status.
    const forward: number[] = task.status < type.finalStatus ? [task.status + 1] : [];
    // Forward first so the picker shows "advance" as the default top option, then backward fall-back choices.
    return [...forward, ...backward];
  },
} as const;
