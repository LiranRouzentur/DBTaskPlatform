import { Injectable, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ToastService } from '../../../core/services/toast.service';
import { DISCARD_CHANGES_COPY } from '../../../core/ui/confirm-modal/discard-changes.copy';
import { DialogState } from '../../../core/utils/dialog-state';
import { formSignal, formStatusSignal, setControl } from '../../../core/utils/form-helpers';
import { bindStoreErrorToast, defaultErrorTitle } from '../../../core/utils/store-error-toast';
import { TasksStore } from '../../../state/tasks.store';

export type ActiveCreateTaskDialog = 'create' | 'cancel';

/** Facade for the create-task modal: type/assignee selection → confirm → store.create(). */
@Injectable()
export class CreateTaskFacade {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly store = inject(TasksStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  // ─── Template constants ──────────────────────────────────────────────────
  readonly storeRef = this.store;
  readonly discard = DISCARD_CHANGES_COPY;
  readonly dialog = new DialogState<ActiveCreateTaskDialog>();

  // ─── Forms ───────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    taskTypeId: this.fb.control<number>(
      this.store.taskTypes()[0]?.id ?? 0,
      [Validators.required, Validators.min(1)],
    ),
    initialAssignedUserId: this.fb.control<number>(
      this.store.currentUserId() ?? this.store.users()[0]?.id ?? 0,
      [Validators.required, Validators.min(1)],
    ),
  });

  // ─── Observable → Signal Bridges ─────────────────────────────────────────
  private readonly taskTypeIdValue = formSignal(this.form.controls.taskTypeId);
  private readonly assigneeIdValue = formSignal(this.form.controls.initialAssignedUserId);
  private readonly formStatus = formStatusSignal(this.form);

  // ─── Computed ────────────────────────────────────────────────────────────
  readonly selectedTypeId = computed(() => this.taskTypeIdValue());
  readonly selectedAssigneeId = computed(() => this.assigneeIdValue());

  readonly selectedTypeName = computed(
    () => this.store.taskTypeById().get(this.selectedTypeId())?.name ?? '',
  );

  readonly selectedAssigneeName = computed(
    () => this.store.userById().get(this.selectedAssigneeId())?.fullName ?? '',
  );

  readonly canSubmit = computed(
    () => this.formStatus() === 'VALID' && !this.store.loading(),
  );

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    bindStoreErrorToast(this.store, defaultErrorTitle('We couldn’t create that task'));
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  pickType(id: number): void {
    setControl(this.form.controls.taskTypeId, id);
  }

  pickAssignee(id: number): void {
    setControl(this.form.controls.initialAssignedUserId, id);
  }

  onSubmit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialog.open('create');
  }

  requestCancel(): void {
    if (this.form.dirty) {
      this.dialog.open('cancel');
      return;
    }
    this.routeBack();
  }

  async confirmDialog(): Promise<void> {
    const kind = this.dialog.active();
    this.dialog.close();
    if (kind === 'create') {
      await this.executeCreate();
    } else if (kind === 'cancel') {
      this.routeBack();
    }
  }

  cancelDialog(): void {
    this.dialog.close();
  }

  routeBack(): void {
    this.router.navigate(['/tasks'], { skipLocationChange: true });
  }

  // ─── Private methods ─────────────────────────────────────────────────────
  private async executeCreate(): Promise<void> {
    const value = this.form.getRawValue();
    const result = await this.store.create({
      taskTypeId: value.taskTypeId,
      initialAssignedUserId: value.initialAssignedUserId,
    });
    if (!result) return;
    const assigneeName =
      this.store.userById().get(value.initialAssignedUserId)?.fullName ?? 'assignee';
    this.toasts.success(`Created and assigned to ${assigneeName}.`, 'Task created');
    this.router.navigate(['/tasks', result.id, 'change-status'], {
      skipLocationChange: true,
    });
  }
}
