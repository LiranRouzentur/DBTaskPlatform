import { TaskListItem } from '../models/task.model';
import { TaskTypeMetadata } from '../models/task-type-metadata.model';

// Client mirror of the server's WorkflowEngine rules. The WorkflowRule union below MUST stay
// in sync with backend WorkflowError.Rule keys. Defence-in-depth: UI gates AND server validate.
// Plain const-object (not @Injectable) — every consumer needs the same value, no DI swap.

type Task = TaskListItem;

export interface WorkflowCheck {
  readonly ok: boolean;
  
  readonly rule?: WorkflowRule;
  readonly message?: string;
}

export type WorkflowRule =
  | 'closed-immutable'
  | 'no-movement'
  | 'invalid-status'
  | 'no-forward-skip'
  | 'beyond-final'
  | 'not-at-final'
  | 'already-closed'
  | 'invalid-next-user';

const OK: WorkflowCheck = { ok: true };

function fail(rule: WorkflowRule, message: string): WorkflowCheck {
  return { ok: false, rule, message };
}

export const WorkflowValidators = {
  
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

  isAssigneeValid(userId: number | null | undefined): boolean {
    return typeof userId === 'number' && Number.isInteger(userId) && userId > 0;
  },

  validTargets(task: Task, type: TaskTypeMetadata): readonly number[] {
    if (task.isClosed) return [];
    const backward: number[] = [];
    for (let s = 1; s < task.status; s++) backward.push(s);
    const forward: number[] = task.status < type.finalStatus ? [task.status + 1] : [];
    return [...forward, ...backward];
  },
} as const;
