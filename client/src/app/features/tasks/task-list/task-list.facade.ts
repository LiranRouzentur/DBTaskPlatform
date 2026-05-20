import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ALL_VALUE, SortDir, StateFilter } from '../../../core/models/filters.model';
import { ToastService } from '../../../core/services/toast.service';
import { BadgeTone } from '../../../core/ui/badge/badge.component';
import { SegmentedOption } from '../../../core/ui/segmented/segmented.component';
import { taskTypeTone } from '../../../core/ui/task-type-tone';
import { ALL_USERS_VALUE } from '../../../core/ui/user-picker/user-picker.component';
import { bindStoreErrorToast, defaultErrorTitle } from '../../../core/utils/store-error-toast';
import { TasksStore } from '../../../state/tasks.store';

import { compareRows, RowView, SortKey, toRowView } from './task-list-row';

export const ALL_TYPES = ALL_VALUE;

/** Task-list facade. User/type filters refetch via store; state filter + sort are pure-view. */
@Injectable()
export class TaskListFacade {
  // ─── Dependencies ────────────────────────────────────────────────────────
  private readonly store = inject(TasksStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  // ─── Template constants ──────────────────────────────────────────────────
  readonly storeRef = this.store;
  readonly ALL_TYPES = ALL_TYPES;

  // ─── Writable Signals ────────────────────────────────────────────────────
  readonly confirmCloseRow = signal<RowView | null>(null);
  readonly sortKey = signal<SortKey>('updated');
  readonly sortDir = signal<SortDir>('desc');

  // ─── Computed ────────────────────────────────────────────────────────────
  readonly typeFilterOptions = computed(() => [
    { value: ALL_TYPES, label: 'All task types' },
    ...this.store.taskTypes().map((t) => ({ value: t.id, label: t.name })),
  ]);

  readonly userPickerValue = computed<number | null>(() =>
    this.store.isAllUsers() ? ALL_USERS_VALUE : this.store.currentUserId(),
  );

  readonly activeTab = computed<StateFilter>(() => this.store.stateFilter());
  readonly typeFilter = computed<number>(() => this.store.typeFilter() ?? ALL_TYPES);

  readonly visibleRows = computed<readonly RowView[]>(() => {
    const stateFilter = this.activeTab();
    const all = this.store.tasks();
    const tasks =
      stateFilter === 'open' ? all.filter((t) => !t.isClosed)
      : stateFilter === 'closed' ? all.filter((t) => t.isClosed)
      : all;
    const typeById = this.store.taskTypeById();
    const userById = this.store.userById();
    const rows = tasks.map((task) => toRowView(task, typeById.get(task.taskTypeId), userById));
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => dir * compareRows(a, b, key));
  });

  readonly tabs = computed<readonly SegmentedOption<StateFilter>[]>(() => {
    const all = this.store.tasks();
    const open = this.store.openTasks().length;
    const closed = this.store.closedTasks().length;
    return [
      { value: 'all', label: 'All', count: all.length },
      { value: 'open', label: 'Open', count: open },
      { value: 'closed', label: 'Closed', count: closed },
    ];
  });

  readonly hasAnyTasks = computed(() => this.store.tasks().length > 0);
  readonly initialLoading = computed(
    () => this.store.loading() && this.store.tasks().length === 0,
  );

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    bindStoreErrorToast(this.store, defaultErrorTitle('Something went wrong'));
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortKey.set(key);
    this.sortDir.set('asc');
  }

  requestCloseRow(row: RowView): void {
    this.confirmCloseRow.set(row);
  }

  cancelCloseRow(): void {
    this.confirmCloseRow.set(null);
  }

  async onConfirmClose(): Promise<void> {
    const row = this.confirmCloseRow();
    if (!row) return;
    this.confirmCloseRow.set(null);
    const result = await this.store.close(row.task.id);
    if (result) {
      this.toasts.success(`${row.typeName} task marked as closed.`, 'Task closed');
    }
  }

  goToChangeStatus(row: RowView): void {
    this.router.navigate(['/tasks', row.task.id, 'change-status'], { skipLocationChange: true });
  }

  goToNew(): void {
    this.router.navigate(['/tasks/new'], { skipLocationChange: true });
  }

  segmentedValueChange(value: StateFilter): void {
    this.store.setStateFilter(value);
  }

  async onTypeFilterChange(value: number): Promise<void> {
    await this.store.setTypeFilter(value === ALL_TYPES ? null : value);
  }

  async onUserPick(value: number): Promise<void> {
    if (value === ALL_USERS_VALUE) {
      if (this.store.isAllUsers()) return;
      await this.store.setCurrentUser(null);
      this.toasts.info('Viewing tasks for all users.', 'Switched user');
      return;
    }
    if (value === this.store.currentUserId()) return;
    await this.store.setCurrentUser(value);
    const u = this.store.currentUser();
    if (u) this.toasts.info(`Viewing tasks for ${u.fullName}.`, 'Switched user');
  }

  typeTone(typeId: number): BadgeTone {
    return taskTypeTone(typeId);
  }
}
