import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { TaskApi, TaskListFilters } from '../core/api/task-api.service';
import { TaskTypesApi } from '../core/api/task-types-api.service';
import { UsersApi } from '../core/api/users-api.service';
import { ApiError } from '../core/models/api-error.model';
import { ChangeStatusRequest } from '../core/models/change-status-request.model';
import { CreateTaskRequest } from '../core/models/create-task-request.model';
import { StateFilter } from '../core/models/filters.model';
import { TaskTypeMetadata } from '../core/models/task-type-metadata.model';
import { TaskDetail, TaskListItem } from '../core/models/task.model';
import { UpdateStepDataRequest } from '../core/models/update-step-data-request.model';
import { User } from '../core/models/user.model';
import { ToastService } from '../core/services/toast.service';
import { UserPreferencesService } from '../core/services/user-preferences.service';

/** Root signal-store. user/type filters refetch; stateFilter is view-only; runMutation auto-recovers 409. */
interface TasksState {
  /** Flat list of tasks matching current user/type filters; contains both open and closed (stateFilter narrows the view). */
  readonly tasks: readonly TaskListItem[];
  /** Task-type metadata (id, name, statuses, field-specs) loaded once; drives dynamic-form rendering and lookups. */
  readonly taskTypes: readonly TaskTypeMetadata[];
  /** All users — drives the "Assigned to" picker and the current-user filter dropdown. */
  readonly users: readonly User[];

  /** Active user filter; `null` means "All Users". Persisted via UserPreferencesService. Triggers list refetch on change. */
  readonly currentUserId: number | null;
  /** Active task-type filter; `null` means "All Types". Triggers list refetch on change. */
  readonly typeFilter: number | null;
  /** View-only filter (open/closed/all). Does NOT refetch — tab counts must remain consistent across switches. */
  readonly stateFilter: StateFilter;

  /** Per-id cache of fully-hydrated TaskDetail; populated by loadDetail() and mutation responses. */
  readonly detailById: Readonly<Record<number, TaskDetail>>;
  /** Ids currently being fetched by loadDetail — used to dedupe concurrent requests for the same task id. */
  readonly detailLoadingIds: ReadonlySet<number>;

  /** True while any list/detail/mutation request is in flight; drives spinners and disables submit buttons. */
  readonly loading: boolean;
  /** Last typed ApiError surfaced from a query or mutation; `null` after clearError() or a successful op. */
  readonly error: ApiError | null;
}

/** Empty starting state — no tasks, no filters, no errors. Mirrors a "fresh app load" before any fetch. */
const initialState: TasksState = {
  tasks: [],
  taskTypes: [],
  users: [],
  currentUserId: null,
  typeFilter: null,
  stateFilter: 'all',
  detailById: {},
  detailLoadingIds: new Set<number>(),
  loading: false,
  error: null,
};

export const TasksStore = signalStore(
  // providedIn: 'root' — single store instance per app, lives for the app's lifetime.
  { providedIn: 'root' },
  withState<TasksState>(initialState),
  withComputed((state) => ({
    /** Subset of `tasks` that are still open — feeds the "Open" tab in task-list. */
    openTasks: computed(() => state.tasks().filter((t) => !t.isClosed)),
    /** Subset of `tasks` that are closed — feeds the "Closed" tab in task-list. */
    closedTasks: computed(() => state.tasks().filter((t) => t.isClosed)),
    /** Resolves `currentUserId` to the full User object; `null` when "All Users" or id no longer exists. */
    currentUser: computed(() => {
      const id = state.currentUserId();
      return id ? state.users().find((u) => u.id === id) ?? null : null;
    }),
    /** True when no specific user is selected (the "All Users" pseudo-id). Drives the user-picker label. */
    isAllUsers: computed(() => state.currentUserId() === null),

    /** O(1) lookup map of task-type id → metadata; avoids repeated linear .find() in templates and lists. */
    taskTypeById: computed(() => {
      const map = new Map<number, TaskTypeMetadata>();
      for (const t of state.taskTypes()) map.set(t.id, t);
      return map;
    }),

    /** O(1) lookup map of user id → User; avoids repeated linear .find() when rendering assignee badges. */
    userById: computed(() => {
      const map = new Map<number, User>();
      for (const u of state.users()) map.set(u.id, u);
      return map;
    }),
  })),
  withMethods(
    (
      store,
      // Injected dependencies — listed here instead of constructor params because withMethods uses a factory fn.
      taskApi = inject(TaskApi),
      typesApi = inject(TaskTypesApi),
      usersApi = inject(UsersApi),
      prefs = inject(UserPreferencesService),
      toasts = inject(ToastService),
    ) => {
      // ─── Internals ─────────────────────────────────────────────────────

      /** Snapshots the current filter signals into the shape TaskApi.list expects. `isClosed: null` = both open and closed. */
      const currentFilters = (): TaskListFilters => ({
        userId: store.currentUserId(),
        taskTypeId: store.typeFilter(),
        isClosed: null,
      });

      /** Thin Observable→Promise wrapper around TaskApi.list — kept as a one-liner for readability at call sites. */
      const fetchList = (filters: TaskListFilters): Promise<readonly TaskListItem[]> =>
        firstValueFrom(taskApi.list(filters));

      /** Monotonic counter — incremented per fetch attempt so older in-flight responses can be detected and dropped. */
      let fetchSeq = 0;
      /** List fetch with stale-response guard: only the most recent invocation is allowed to patch state.
       *  Prevents a slow response from an earlier filter from clobbering a faster response from a newer filter. */
      const fetchListLatest = async (): Promise<void> => {
        const mySeq = ++fetchSeq;
        patchState(store, { loading: true, error: null });
        try {
          const tasks = await fetchList(currentFilters());
          // Bail if a newer fetch has started — its response will own the state.
          if (mySeq !== fetchSeq) return;
          patchState(store, { tasks, loading: false });
        } catch (err) {
          if (mySeq !== fetchSeq) return;
          const apiErr = err as ApiError;
          patchState(store, { error: apiErr, loading: false });
          toasts.fromApiError(apiErr);
        }
      };

      /** Plain refetch used after 409 recovery — no seq guard, no error toast (the caller controls UX). */
      const refreshList = async (): Promise<void> => {
        const tasks = await fetchList(currentFilters());
        patchState(store, { tasks, loading: false, error: null });
      };

      /** 409 "concurrent-modification" auto-recovery: refetch the list, show an "out of sync" toast, swallow the error.
       *  Returns true if the error was handled here so the caller skips its own error-surfacing path. */
      const handleConcurrentModification = async (err: ApiError): Promise<boolean> => {
        if (err.kind !== 'conflict' || err.rule !== 'concurrent-modification') return false;
        try {
          await refreshList();
        } catch {
          // Refresh itself failed — fall back to surfacing the original conflict error.
          patchState(store, { error: err, loading: false });
        }
        toasts.warning(
          'This task was updated by someone else — the list was refreshed.',
          'Out of sync',
        );
        return true;
      };

      /** Returns a new tasks array with `item` upserted (replace by id, or append if new). Pure — no mutation. */
      const patchListWith = (item: TaskListItem): readonly TaskListItem[] => {
        const idx = store.tasks().findIndex((t) => t.id === item.id);
        if (idx === -1) return [...store.tasks(), item];
        const next = store.tasks().slice();
        next[idx] = item;
        return next;
      };

      /** Projects a full TaskDetail down to the lighter TaskListItem shape used in the list view. */
      const toListItem = (d: TaskDetail): TaskListItem => ({
        id: d.id,
        taskTypeId: d.taskTypeId,
        status: d.status,
        isClosed: d.isClosed,
        assignedUserId: d.assignedUserId,
        updatedAtUtc: d.updatedAtUtc,
      });

      /** Per-call tuning for runMutation. */
      interface MutationOptions {
        /** When true (default), 409 conflicts trigger refetch+toast and resolve with null. create() turns this off. */
        readonly recoverOn409?: boolean;
        /** When true (default), errors are toasted. create() turns this off because 422s are projected onto the form. */
        readonly surfaceErrors?: boolean;
      }
      /** Single mutation runner. Patches list + detail cache from the response on success;
       *  on failure delegates to handleConcurrentModification or surfaces the typed ApiError. */
      const runMutation = async (
        call: () => Promise<TaskDetail>,
        opts: MutationOptions = {},
      ): Promise<TaskDetail | null> => {
        const { recoverOn409 = true, surfaceErrors = true } = opts;
        patchState(store, { loading: true, error: null });
        try {
          const detail = await call();
          patchState(store, {
            // Keep the list in sync with the latest detail — avoids a roundtrip refetch.
            tasks: patchListWith(toListItem(detail)),
            // Cache the detail so subsequent loadDetail(id) calls hit the cache.
            detailById: { ...store.detailById(), [detail.id]: detail },
            loading: false,
          });
          return detail;
        } catch (err) {
          const apiErr = err as ApiError;
          if (recoverOn409 && (await handleConcurrentModification(apiErr))) return null;
          patchState(store, { error: apiErr, loading: false });
          if (surfaceErrors) toasts.fromApiError(apiErr);
          return null;
        }
      };

      /** Generic query runner: runs `call`, merges its returned partial into state, toasts + rethrows on error.
       *  Used by simple loaders (loadTaskTypes, loadUsers) that return a single state slice. */
      const runQuery = async <T extends Partial<TasksState>>(
        call: () => Promise<T>,
      ): Promise<void> => {
        patchState(store, { loading: true, error: null });
        try {
          const patch = await call();
          patchState(store, { ...patch, loading: false });
        } catch (err) {
          const apiErr = err as ApiError;
          patchState(store, { error: apiErr, loading: false });
          toasts.fromApiError(apiErr);
          // Rethrow so app-init can decide whether to halt bootstrap; mutation paths swallow instead.
          throw apiErr;
        }
      };

      // ─── Public API ────────────────────────────────────────────────────
      return {
        /** Loads the task-type catalog (once at startup). Drives dynamic-form rendering and the type filter. */
        async loadTaskTypes(): Promise<void> {
          await runQuery(async () => ({
            taskTypes: await firstValueFrom(typesApi.getAll()),
          }));
        },

        /** Loads all users (once at startup). Drives the assignee picker and the current-user filter. */
        async loadUsers(): Promise<void> {
          await runQuery(async () => ({
            users: await firstValueFrom(usersApi.getAll()),
          }));
        },

        /** Loads the task list for the current filters with stale-response protection. Safe to call on filter changes. */
        async load(): Promise<void> {
          await fetchListLatest();
        },

        /** Lazy + deduped detail loader. Concurrent calls for the same id share the in-flight fetch.
         *  Returns the cached detail immediately if a load is already in progress for that id. */
        async loadDetail(id: number): Promise<TaskDetail | null> {
          if (store.detailLoadingIds().has(id)) {
            return store.detailById()[id] ?? null;
          }
          // Mark id as loading so concurrent callers dedupe through the early-return above.
          const startingIds = new Set(store.detailLoadingIds());
          startingIds.add(id);
          patchState(store, { detailLoadingIds: startingIds });
          try {
            const detail = await firstValueFrom(taskApi.getById(id));
            patchState(store, {
              detailById: { ...store.detailById(), [id]: detail },
            });
            return detail;
          } catch (err) {
            const apiErr = err as ApiError;
            patchState(store, { error: apiErr });
            toasts.fromApiError(apiErr);
            return null;
          } finally {
            // Always clear the loading marker — even on error — so future calls can retry.
            const doneIds = new Set(store.detailLoadingIds());
            doneIds.delete(id);
            patchState(store, { detailLoadingIds: doneIds });
          }
        },

        /** Switches the active user filter. Persists the choice and refetches the list.
         *  No-ops when the id is unchanged to avoid a redundant network call. */
        async setCurrentUser(userId: number | null): Promise<void> {
          if (userId === store.currentUserId()) return;
          prefs.writeCurrentUserId(userId);
          patchState(store, { currentUserId: userId });
          await fetchListLatest();
        },

        /** Switches the active task-type filter and refetches the list. No-ops when unchanged. */
        async setTypeFilter(taskTypeId: number | null): Promise<void> {
          if (taskTypeId === store.typeFilter()) return;
          patchState(store, { typeFilter: taskTypeId });
          await fetchListLatest();
        },

        /** Switches the open/closed/all view. Local-only — no network call (tab counts depend on the full list). */
        setStateFilter(stateFilter: StateFilter): void {
          if (stateFilter === store.stateFilter()) return;
          patchState(store, { stateFilter });
        },

        /** Creates a new task. Opts out of 409 recovery (nothing to be out-of-sync with) and toasting
         *  (422 field errors are projected onto the create-task form by the facade). */
        async create(req: CreateTaskRequest): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.create(req)), {
            recoverOn409: false,
            surfaceErrors: false,
          });
        },

        /** Advances or rolls back a task's status with the change-status modal's custom-data payload. */
        async changeStatus(id: number, req: ChangeStatusRequest): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.changeStatus(id, req)));
        },

        /** Closes a task (terminal state). Domain enforces closed-task immutability — see project.md §4. */
        async close(id: number): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.close(id)));
        },

        /** Updates the per-status custom-data fields on an open task without changing its status. */
        async updateStep(id: number, req: UpdateStepDataRequest): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.updateStep(id, req)));
        },

        /** Clears the surfaced error so error banners disappear without forcing a refetch. */
        clearError(): void {
          patchState(store, { error: null });
        },
      };
    },
  ),
);
