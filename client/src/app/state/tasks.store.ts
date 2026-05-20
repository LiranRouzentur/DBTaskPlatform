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
  readonly tasks: readonly TaskListItem[];
  readonly taskTypes: readonly TaskTypeMetadata[];
  readonly users: readonly User[];

  readonly currentUserId: number | null;
  readonly typeFilter: number | null;
  readonly stateFilter: StateFilter;

  readonly detailById: Readonly<Record<number, TaskDetail>>;
  readonly detailLoadingIds: ReadonlySet<number>;

  readonly loading: boolean;
  readonly error: ApiError | null;
}

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
  { providedIn: 'root' },
  withState<TasksState>(initialState),
  withComputed((state) => ({
    openTasks: computed(() => state.tasks().filter((t) => !t.isClosed)),
    closedTasks: computed(() => state.tasks().filter((t) => t.isClosed)),
    currentUser: computed(() => {
      const id = state.currentUserId();
      return id ? state.users().find((u) => u.id === id) ?? null : null;
    }),
    isAllUsers: computed(() => state.currentUserId() === null),

    taskTypeById: computed(() => {
      const map = new Map<number, TaskTypeMetadata>();
      for (const t of state.taskTypes()) map.set(t.id, t);
      return map;
    }),

    userById: computed(() => {
      const map = new Map<number, User>();
      for (const u of state.users()) map.set(u.id, u);
      return map;
    }),
  })),
  withMethods(
    (
      store,
      taskApi = inject(TaskApi),
      typesApi = inject(TaskTypesApi),
      usersApi = inject(UsersApi),
      prefs = inject(UserPreferencesService),
      toasts = inject(ToastService),
    ) => {
      // ─── Internals ─────────────────────────────────────────────────────
      const currentFilters = (): TaskListFilters => ({
        userId: store.currentUserId(),
        taskTypeId: store.typeFilter(),
        isClosed: null,
      });

      const fetchList = (filters: TaskListFilters): Promise<readonly TaskListItem[]> =>
        firstValueFrom(taskApi.list(filters));

      // Monotonic sequence guard: stale responses (from earlier filter flips) are dropped.
      let fetchSeq = 0;
      const fetchListLatest = async (): Promise<void> => {
        const mySeq = ++fetchSeq;
        patchState(store, { loading: true, error: null });
        try {
          const tasks = await fetchList(currentFilters());
          if (mySeq !== fetchSeq) return;
          patchState(store, { tasks, loading: false });
        } catch (err) {
          if (mySeq !== fetchSeq) return;
          const apiErr = err as ApiError;
          patchState(store, { error: apiErr, loading: false });
          toasts.fromApiError(apiErr);
        }
      };

      const refreshList = async (): Promise<void> => {
        const tasks = await fetchList(currentFilters());
        patchState(store, { tasks, loading: false, error: null });
      };

      // Auto-recovery for 409 "concurrent-modification": refetch list, toast, swallow error.
      const handleConcurrentModification = async (err: ApiError): Promise<boolean> => {
        if (err.kind !== 'conflict' || err.rule !== 'concurrent-modification') return false;
        try {
          await refreshList();
        } catch {
          patchState(store, { error: err, loading: false });
        }
        toasts.warning(
          'This task was updated by someone else — the list was refreshed.',
          'Out of sync',
        );
        return true;
      };

      const patchListWith = (item: TaskListItem): readonly TaskListItem[] => {
        const idx = store.tasks().findIndex((t) => t.id === item.id);
        if (idx === -1) return [...store.tasks(), item];
        const next = store.tasks().slice();
        next[idx] = item;
        return next;
      };

      const toListItem = (d: TaskDetail): TaskListItem => ({
        id: d.id,
        taskTypeId: d.taskTypeId,
        status: d.status,
        isClosed: d.isClosed,
        assignedUserId: d.assignedUserId,
        updatedAtUtc: d.updatedAtUtc,
      });

      // Single mutation runner. Patches list + detail cache from the response; create() opts out
      // of 409 recovery (nothing to be out-of-sync with) and toasting (422 projected onto form).
      interface MutationOptions {
        readonly recoverOn409?: boolean;
        readonly surfaceErrors?: boolean;
      }
      const runMutation = async (
        call: () => Promise<TaskDetail>,
        opts: MutationOptions = {},
      ): Promise<TaskDetail | null> => {
        const { recoverOn409 = true, surfaceErrors = true } = opts;
        patchState(store, { loading: true, error: null });
        try {
          const detail = await call();
          patchState(store, {
            tasks: patchListWith(toListItem(detail)),
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
          throw apiErr;
        }
      };

      // ─── Public API ────────────────────────────────────────────────────
      return {
        async loadTaskTypes(): Promise<void> {
          await runQuery(async () => ({
            taskTypes: await firstValueFrom(typesApi.getAll()),
          }));
        },

        async loadUsers(): Promise<void> {
          await runQuery(async () => ({
            users: await firstValueFrom(usersApi.getAll()),
          }));
        },

        async load(): Promise<void> {
          await fetchListLatest();
        },

        // Lazy + deduped: concurrent calls for the same id reuse the in-flight loader.
        async loadDetail(id: number): Promise<TaskDetail | null> {
          if (store.detailLoadingIds().has(id)) {
            return store.detailById()[id] ?? null;
          }
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
            const doneIds = new Set(store.detailLoadingIds());
            doneIds.delete(id);
            patchState(store, { detailLoadingIds: doneIds });
          }
        },

        async setCurrentUser(userId: number | null): Promise<void> {
          if (userId === store.currentUserId()) return;
          prefs.writeCurrentUserId(userId);
          patchState(store, { currentUserId: userId });
          await fetchListLatest();
        },

        async setTypeFilter(taskTypeId: number | null): Promise<void> {
          if (taskTypeId === store.typeFilter()) return;
          patchState(store, { typeFilter: taskTypeId });
          await fetchListLatest();
        },

        setStateFilter(stateFilter: StateFilter): void {
          if (stateFilter === store.stateFilter()) return;
          patchState(store, { stateFilter });
        },

        async create(req: CreateTaskRequest): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.create(req)), {
            recoverOn409: false,
            surfaceErrors: false,
          });
        },

        async changeStatus(id: number, req: ChangeStatusRequest): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.changeStatus(id, req)));
        },

        async close(id: number): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.close(id)));
        },

        async updateStep(id: number, req: UpdateStepDataRequest): Promise<TaskDetail | null> {
          return runMutation(() => firstValueFrom(taskApi.updateStep(id, req)));
        },

        clearError(): void {
          patchState(store, { error: null });
        },
      };
    },
  ),
);
