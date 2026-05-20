import { TaskListItem } from '../models/task.model';
import { TaskTypeMetadata } from '../models/task-type-metadata.model';
import { WorkflowValidators } from './workflow-validators.service';

const PROCUREMENT: TaskTypeMetadata = {
  id: 1,
  name: 'Procurement',
  finalStatus: 3,
  statuses: [
    { status: 1, name: 'Open', fields: [] },
    { status: 2, name: 'Quotes', fields: [] },
    { status: 3, name: 'Delivered', fields: [] },
  ],
};

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 1,
    taskTypeId: 1,
    status: 2,
    isClosed: false,
    assignedUserId: 1,
    updatedAtUtc: '2026-05-19T00:00:00Z',
    ...overrides,
  };
}

describe('WorkflowValidators', () => {
  describe('canChangeStatus', () => {
    it('rejects closed tasks (rule 2)', () => {
      const r = WorkflowValidators.canChangeStatus(task({ isClosed: true }), 3, PROCUREMENT);
      expect(r.ok).toBe(false);
      expect(r.rule).toBe('closed-immutable');
    });

    it('rejects target equal to current status (no-movement)', () => {
      const r = WorkflowValidators.canChangeStatus(task({ status: 2 }), 2, PROCUREMENT);
      expect(r.rule).toBe('no-movement');
    });

    it('rejects non-positive / non-integer status', () => {
      expect(WorkflowValidators.canChangeStatus(task(), 0, PROCUREMENT).rule).toBe('invalid-status');
      expect(WorkflowValidators.canChangeStatus(task(), -1, PROCUREMENT).rule).toBe('invalid-status');
      expect(WorkflowValidators.canChangeStatus(task(), 2.5, PROCUREMENT).rule).toBe('invalid-status');
    });

    it('rejects forward skip (rule 4)', () => {
      const r = WorkflowValidators.canChangeStatus(task({ status: 1 }), 3, PROCUREMENT);
      expect(r.rule).toBe('no-forward-skip');
    });

    it('rejects beyond final', () => {
      const r = WorkflowValidators.canChangeStatus(task({ status: 3 }), 4, PROCUREMENT);
      expect(r.rule).toBe('beyond-final');
    });

    it('allows forward by 1', () => {
      expect(WorkflowValidators.canChangeStatus(task({ status: 1 }), 2, PROCUREMENT).ok).toBe(true);
      expect(WorkflowValidators.canChangeStatus(task({ status: 2 }), 3, PROCUREMENT).ok).toBe(true);
    });

    it('allows backward by any amount (rule 5)', () => {
      expect(WorkflowValidators.canChangeStatus(task({ status: 3 }), 2, PROCUREMENT).ok).toBe(true);
      expect(WorkflowValidators.canChangeStatus(task({ status: 3 }), 1, PROCUREMENT).ok).toBe(true);
      expect(WorkflowValidators.canChangeStatus(task({ status: 2 }), 1, PROCUREMENT).ok).toBe(true);
    });
  });

  describe('canClose', () => {
    it('rejects already-closed', () => {
      const r = WorkflowValidators.canClose(task({ isClosed: true }), PROCUREMENT);
      expect(r.rule).toBe('already-closed');
    });

    it('rejects close before final (rule 6)', () => {
      const r = WorkflowValidators.canClose(task({ status: 2 }), PROCUREMENT);
      expect(r.rule).toBe('not-at-final');
    });

    it('allows close at final', () => {
      expect(WorkflowValidators.canClose(task({ status: 3 }), PROCUREMENT).ok).toBe(true);
    });
  });

  describe('isAssigneeValid (rule 7b)', () => {
    it('accepts positive integers', () => {
      expect(WorkflowValidators.isAssigneeValid(1)).toBe(true);
      expect(WorkflowValidators.isAssigneeValid(42)).toBe(true);
    });

    it('rejects null/undefined/zero/negative/non-integer', () => {
      expect(WorkflowValidators.isAssigneeValid(null)).toBe(false);
      expect(WorkflowValidators.isAssigneeValid(undefined)).toBe(false);
      expect(WorkflowValidators.isAssigneeValid(0)).toBe(false);
      expect(WorkflowValidators.isAssigneeValid(-1)).toBe(false);
      expect(WorkflowValidators.isAssigneeValid(1.5)).toBe(false);
    });
  });

  describe('validTargets', () => {
    it('returns [] for closed tasks', () => {
      expect(WorkflowValidators.validTargets(task({ isClosed: true }), PROCUREMENT)).toEqual([]);
    });

    it('from status 1: [2] (only forward — no backward target exists)', () => {
      expect(WorkflowValidators.validTargets(task({ status: 1 }), PROCUREMENT)).toEqual([2]);
    });

    it('from status 2: [3, 1] (forward + one backward)', () => {
      expect(WorkflowValidators.validTargets(task({ status: 2 }), PROCUREMENT)).toEqual([3, 1]);
    });

    it('from status 3 (final): [1, 2] (no forward, two backward)', () => {
      expect(WorkflowValidators.validTargets(task({ status: 3 }), PROCUREMENT)).toEqual([1, 2]);
    });
  });
});
