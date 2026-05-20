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

/** Re-exported sentinel for the "All Types" pseudo-id — the template compares against this rather than a magic number. */
export const ALL_TYPES = ALL_VALUE;

/**
 * Facade for the task-list page. UX-only orchestration; the heavy state work (refetching, optimistic concurrency)
 * is delegated to `TasksStore`. User/type filter changes refetch via the store; the open/closed/all tab is a
 * pure-view filter so tab counts stay consistent across switches (rules/frontend.md §6).
 */
@Injectable()
export class TaskListFacade {
  // ─── Dependencies ────────────────────────────────────────────────────────
  /** Shared signal-store — single source of truth for tasks, filters, and mutations. */
  private readonly store = inject(TasksStore);
  /** Used for opening the modal child routes via `skipLocationChange: true` (rules/frontend.md §5). */
  private readonly router = inject(Router);
  /** Surfaces transient success/info toasts; error toasts are bound via `bindStoreErrorToast`. */
  private readonly toasts = inject(ToastService);

  // ─── Template constants ──────────────────────────────────────────────────
  /** Alias used by templates to read store signals without injecting the store directly. */
  readonly storeRef = this.store;
  /** Re-exposed sentinel so templates can compare against it without importing `ALL_VALUE`. */
  readonly ALL_TYPES = ALL_TYPES;

  // ─── Writable Signals ────────────────────────────────────────────────────
  /** Row currently held in the "confirm close?" prompt, or null when no prompt is open. */
  readonly confirmCloseRow = signal<RowView | null>(null);
  /** Currently-selected sort column; defaults to most-recently-updated. */
  readonly sortKey = signal<SortKey>('updated');
  /** Current sort direction — desc on initial render so newest tasks show first. */
  readonly sortDir = signal<SortDir>('desc');

  // ─── Computed ────────────────────────────────────────────────────────────
  /** Options for the type-filter dropdown, with the "All task types" sentinel pinned at the top. */
  readonly typeFilterOptions = computed(() => [
    { value: ALL_TYPES, label: 'All task types' },
    ...this.store.taskTypes().map((t) => ({ value: t.id, label: t.name })),
  ]);

  /** Picker-facing value: maps the store's `null` (= all users) to the explicit sentinel the picker expects. */
  readonly userPickerValue = computed<number | null>(() =>
    this.store.isAllUsers() ? ALL_USERS_VALUE : this.store.currentUserId(),
  );

  /** Current open/closed/all tab — pure-view; switching does not trigger a refetch. */
  readonly activeTab = computed<StateFilter>(() => this.store.stateFilter());
  /** Current type filter projected onto the picker sentinel — null becomes ALL_TYPES. */
  readonly typeFilter = computed<number>(() => this.store.typeFilter() ?? ALL_TYPES);

  /** Final ordered rows the template renders: tab filter → row projection → sort by the active key/direction. */
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

  /** Segmented-control options for the open/closed/all tab. Counts always come from the unfiltered list. */
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

  /** True when at least one task is loaded — used to choose between the empty state and the table. */
  readonly hasAnyTasks = computed(() => this.store.tasks().length > 0);
  /** True only on the very first load — drives skeleton placeholders without flashing on subsequent refetches. */
  readonly initialLoading = computed(
    () => this.store.loading() && this.store.tasks().length === 0,
  );

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  constructor() {
    // Single error→toast hookup for the whole page. The store already auto-recovers 409s.
    bindStoreErrorToast(this.store, defaultErrorTitle('Something went wrong'));
  }

  // ─── Public API / UI Actions ─────────────────────────────────────────────
  /** Header-click handler: same column toggles direction; new column resets to ascending. */
  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortKey.set(key);
    this.sortDir.set('asc');
  }

  /** Row close-icon click — opens the confirm prompt with the row attached. */
  requestCloseRow(row: RowView): void {
    this.confirmCloseRow.set(row);
  }

  /** User cancelled the close prompt — drop the held row. */
  cancelCloseRow(): void {
    this.confirmCloseRow.set(null);
  }

  /** Confirm-close handler — closes the task via the store and toasts on success. */
  async onConfirmClose(): Promise<void> {
    const row = this.confirmCloseRow();
    if (!row) return;
    this.confirmCloseRow.set(null);
    const result = await this.store.close(row.task.id);
    if (result) {
      this.toasts.success(`${row.typeName} task marked as closed.`, 'Task closed');
    }
  }

  /** Opens the change-status modal — child route navigation with `skipLocationChange` (frontend.md §5). */
  goToChangeStatus(row: RowView): void {
    this.router.navigate(['/tasks', row.task.id, 'change-status'], { skipLocationChange: true });
  }

  /** Opens the create-task modal — same `skipLocationChange` pattern. */
  goToNew(): void {
    this.router.navigate(['/tasks/new'], { skipLocationChange: true });
  }

  /** Tab change handler — local view filter only, no refetch. */
  segmentedValueChange(value: StateFilter): void {
    this.store.setStateFilter(value);
  }

  /** Type filter change — translates the ALL_TYPES sentinel back to `null` for the store contract. */
  async onTypeFilterChange(value: number): Promise<void> {
    await this.store.setTypeFilter(value === ALL_TYPES ? null : value);
  }

  /** User picker change — handles the All-Users sentinel branch and toasts when the user actually switches. */
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

  /** Stable colour-token lookup for the task-type badge; thin wrapper kept here so templates don't import utils. */
  typeTone(typeId: number): BadgeTone {
    return taskTypeTone(typeId);
  }
}
