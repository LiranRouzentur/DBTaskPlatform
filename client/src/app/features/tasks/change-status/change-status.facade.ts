import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiError } from '../../../core/models/api-error.model';
import { ToastService } from '../../../core/services/toast.service';
import { DISCARD_CHANGES_COPY } from '../../../core/ui/confirm-modal/discard-changes.copy';
import { DialogState } from '../../../core/utils/dialog-state';
import { formSignal, formStatusSignal, setControl } from '../../../core/utils/form-helpers';
import { formatAbsolute, formatRelativeTime } from '../../../core/utils/relative-time';
import { shortenTaskId } from '../../../core/utils/shorten-id';
import { bindStoreErrorToast } from '../../../core/utils/store-error-toast';
import { WorkflowValidators } from '../../../core/validators/workflow-validators.service';
import { TasksStore } from '../../../state/tasks.store';

import { ChangeStatusPresenter, StatusOptionView } from './change-status.presenter';
import { CustomDataFormController } from './custom-data-form.controller';

export type ActiveConfirmDialog =
  | 'close'
  | 'cancel'
  | 'backward'
  | 'forward'
  | 'in-place';

/** Facade for the change-status modal: detail fetch, options, form lifecycle, dirty-guard, submit dispatch. */
@Injectable()
export class ChangeStatusFacade {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly store = inject(TasksStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly presenter = inject(ChangeStatusPresenter);
  readonly cdf = inject(CustomDataFormController);

  // ─── Template constants ──────────────────────────────────────────────────
  readonly storeRef = this.store;
  readonly discard = DISCARD_CHANGES_COPY;
  readonly dialog = new DialogState<ActiveConfirmDialog>();

  // ─── Forms ───────────────────────────────────────────────────────────────
  readonly outerForm = this.fb.group({
    targetStatus: this.fb.control<number | null>(null),
    nextAssignedUserId: this.fb.control<number>(0, [Validators.required, Validators.min(1)]),
  });

  // ─── Writable Signals ────────────────────────────────────────────────────
  readonly taskId = signal(0);
  readonly targetStatus = signal<number | null>(null);
  readonly pendingStatusSwitch = signal<StatusOptionView | null>(null);

  // ─── Observable → Signal Bridges ─────────────────────────────────────────
  private readonly nextAssigneeValue = formSignal(this.outerForm.controls.nextAssignedUserId);
  private readonly nextAssigneeStatusSignal = formStatusSignal(
    this.outerForm.controls.nextAssignedUserId,
  );

  // ─── Computed ────────────────────────────────────────────────────────────
  readonly task = computed(() => this.store.detailById()[this.taskId()] ?? null);
  readonly detailLoading = computed(() => this.store.detailLoadingIds().has(this.taskId()));

  readonly taskType = computed(() => {
    const t = this.task();
    return t ? this.store.taskTypeById().get(t.taskTypeId) ?? null : null;
  });

  readonly assignee = computed(() => {
    const t = this.task();
    return t ? this.store.userById().get(t.assignedUserId) ?? null : null;
  });

  readonly shortId = computed(() => {
    const t = this.task();
    return t ? shortenTaskId(t.id) : '';
  });

  readonly updatedRelative = computed(() => {
    const t = this.task();
    return t ? formatRelativeTime(t.updatedAtUtc) : '';
  });

  readonly updatedAbsolute = computed(() => {
    const t = this.task();
    return t ? formatAbsolute(t.updatedAtUtc) : '';
  });

  readonly currentStatusName = computed(() =>
    this.presenter.statusName(this.task()?.status ?? null, this.taskType()),
  );

  readonly targetStatusName = computed(() =>
    this.presenter.statusName(this.targetStatus(), this.taskType()),
  );

  readonly targetIsBackward = computed(() => {
    const target = this.targetStatus();
    const task = this.task();
    return target !== null && task !== null && target < task.status;
  });

  readonly statusOptions = computed<readonly StatusOptionView[]>(() => {
    const task = this.task();
    const type = this.taskType();
    return task && type ? this.presenter.buildStatusOptions(task, type) : [];
  });

  readonly workflowCheck = computed(() => {
    const task = this.task();
    const type = this.taskType();
    const target = this.targetStatus();
    if (!task || !type || target == null) return { ok: true } as const;
    return WorkflowValidators.canChangeStatus(task, target, type);
  });

  readonly canCloseTask = computed(() => {
    const task = this.task();
    const type = this.taskType();
    return !!task && !!type && WorkflowValidators.canClose(task, type).ok;
  });

  readonly nextAssigneeId = computed<number | null>(() => {
    const v = this.nextAssigneeValue();
    return typeof v === 'number' && v > 0 ? v : null;
  });

  readonly assigneeErrors = computed<readonly string[]>(() => {
    void this.nextAssigneeStatusSignal();
    const ctrl = this.outerForm.controls.nextAssignedUserId;
    if (!ctrl.touched || !ctrl.invalid) return [];
    return ['Pick an assignee.'];
  });

  // ─── Effects ─────────────────────────────────────────────────────────────
  /** Load detail lazily when a task id is set and not yet cached. */
  private readonly _loadDetailOnTaskId = effect(() => {
    const id = this.taskId();
    if (!id) return;
    const cached = untracked(() => this.store.detailById()[id]);
    if (!cached) void this.store.loadDetail(id);
  });

  /** Seed the custom-data form once task + type become available. */
  private readonly _seedCustomDataForm = effect(() => {
    const task = this.task();
    const type = this.taskType();
    if (!task || !type) return;
    if (this.targetStatus() === null && this.cdf.form() === null) {
      this.rebuildCustomDataForm(task.status);
    }
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    this.outerForm.controls.targetStatus.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        this.targetStatus.set(value);
        this.rebuildCustomDataForm(value);
      });

    bindStoreErrorToast(this.store, errorTitle, undefined, (err) =>
      this.cdf.applyServerFieldErrors(err),
    );
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  setTaskId(id: number): void {
    this.taskId.set(id);
  }

  pickStatus(option: StatusOptionView): void {
    if (option.disabled) return;

    const wantsCurrent = option.direction === 'current';
    const sameAsCurrent = option.status === this.targetStatus();
    if (!wantsCurrent && sameAsCurrent) return;

    if (this.targetStatus() !== null && this.isDirty()) {
      this.pendingStatusSwitch.set(option);
      return;
    }
    this.commitTarget(wantsCurrent ? null : option.status);
  }

  pickAssignee(id: number): void {
    setControl(this.outerForm.controls.nextAssignedUserId, id);
  }

  confirmStatusSwitch(): void {
    const pending = this.pendingStatusSwitch();
    if (!pending) return;
    this.pendingStatusSwitch.set(null);
    this.commitTarget(pending.direction === 'current' ? null : pending.status);
  }

  cancelStatusSwitch(): void {
    this.pendingStatusSwitch.set(null);
  }

  requestClose(): void {
    this.dialog.open('close');
  }

  requestCancel(): void {
    if (this.isDirty()) {
      this.dialog.open('cancel');
      return;
    }
    this.routeBack();
  }

  onSubmitRequest(): void {
    this.outerForm.markAllAsTouched();
    this.cdf.markAllAsTouched();

    const task = this.task();
    if (!task) return;

    const target = this.targetStatus();
    const customData = this.cdf.normalize();
    const nextUserId = this.outerForm.controls.nextAssignedUserId.value;
    const intentTarget = target ?? task.status;
    const dataChanged = this.cdf.hasChanges(task, intentTarget, customData, nextUserId);
    const isInPlace = target === null || target === task.status;

    if (isInPlace && !dataChanged) {
      this.toasts.info('No changes to save.', 'Nothing to update');
      return;
    }
    if (this.outerForm.controls.nextAssignedUserId.invalid) return;
    if (this.cdf.isInvalid()) return;
    if (isInPlace) {
      this.dialog.open('in-place');
      return;
    }
    if (!this.workflowCheck().ok) return;
    this.dialog.open(this.targetIsBackward() ? 'backward' : 'forward');
  }

  async confirmDialog(): Promise<void> {
    const kind = this.dialog.active();
    if (!kind) return;
    this.dialog.close();
    switch (kind) {
      case 'forward':
      case 'backward':
        await this.submit();
        return;
      case 'in-place':
        await this.submitInPlace();
        return;
      case 'close':
        await this.closeTask();
        return;
      case 'cancel':
        this.routeBack();
        return;
    }
  }

  cancelDialog(): void {
    this.dialog.close();
  }

  routeBack(): void {
    this.router.navigate(['/tasks'], { skipLocationChange: true });
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  private commitTarget(status: number | null): void {
    this.cdf.clear();
    this.outerForm.controls.targetStatus.setValue(status);
  }

  private rebuildCustomDataForm(target: number | null): void {
    const assigneeFromHistory = this.cdf.rebuild(this.task(), this.taskType(), target);
    if (assigneeFromHistory) {
      this.outerForm.controls.nextAssignedUserId.setValue(assigneeFromHistory);
      this.outerForm.controls.nextAssignedUserId.markAsPristine();
    }
  }

  private async submit(): Promise<void> {
    const task = this.task();
    if (!task) return;
    const { targetStatus, nextAssignedUserId } = this.outerForm.getRawValue();
    const result = await this.store.changeStatus(task.id, {
      newStatus: targetStatus as number,
      nextAssignedUserId,
      customData: this.cdf.normalize(),
    });
    if (!result) return;
    const targetName = this.targetStatusName();
    this.toasts.success(
      `Moved to status ${result.status}${targetName ? ' · ' + targetName : ''}.`,
      'Status updated',
    );
    this.targetStatus.set(null);
    this.rebuildCustomDataForm(null);
  }

  private async submitInPlace(): Promise<void> {
    const task = this.task();
    if (!task) return;
    const result = await this.store.updateStep(task.id, {
      status: task.status,
      assignedUserId: this.outerForm.controls.nextAssignedUserId.value,
      customData: this.cdf.normalize(),
    });
    if (!result) return;
    this.toasts.success('Step data updated.', 'Saved');
    this.targetStatus.set(null);
    this.rebuildCustomDataForm(null);
  }

  private async closeTask(): Promise<void> {
    const task = this.task();
    if (!task) return;
    const result = await this.store.close(task.id);
    if (result) this.toasts.success('Task marked as closed.', 'Task closed');
  }

  private isDirty(): boolean {
    if (this.outerForm.controls.nextAssignedUserId.dirty) return true;
    return this.cdf.isDirty();
  }
}

function errorTitle(err: ApiError): string {
  if (err.kind === 'conflict') {
    return err.rule && err.rule !== 'concurrent-modification'
      ? `Workflow rule: ${err.rule}`
      : 'Out of sync';
  }
  return err.kind === 'validation'
    ? 'Some fields need attention'
    : err.kind === 'network'
      ? 'Connection problem'
      : 'We couldn’t update this task';
}
