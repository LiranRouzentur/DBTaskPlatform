import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { retryTransient } from '../http/retry-transient';
import { ChangeStatusRequest } from '../models/change-status-request.model';
import { CreateTaskRequest } from '../models/create-task-request.model';
import { TaskDetail, TaskListItem } from '../models/task.model';
import { UpdateStepDataRequest } from '../models/update-step-data-request.model';

/** Query-string filters for GET /api/tasks. `null` means "no filter applied" — omitted from the URL. */
export interface TaskListFilters {
  /** Filter to tasks assigned to a specific user (any status). Omit for all users. */
  readonly userId?: number | null;
  /** Filter to a specific task-type. Omit for all types. */
  readonly taskTypeId?: number | null;
  /** Filter by open/closed flag. `null` returns both (used by the store — stateFilter is client-side). */
  readonly isClosed?: boolean | null;
}

/**
 * Only place HttpClient is touched for task endpoints (frontend.md §3). GETs are wrapped in
 * retryTransient (network/5xx with exponential backoff); mutations are NOT — retrying a POST
 * could double-write since idempotency is not guaranteed.
 */
@Injectable({ providedIn: 'root' })
export class TaskApi {
  /** Angular HttpClient — injected via `inject()` per frontend.md §1. */
  private readonly http = inject(HttpClient);

  /** GET /api/tasks with optional filters. Retried on transient failures. */
  list(filters: TaskListFilters = {}): Observable<TaskListItem[]> {
    // Start with an empty immutable HttpParams; each `set` returns a new instance so we reassign.
    let params = new HttpParams();
    // Build query string only for filters that are actually set — `null`/`undefined` are dropped.
    // Skip when null/undefined so the server treats the absence as "no user filter" rather than `userId=null`.
    if (filters.userId != null)     params = params.set('userId', filters.userId);
    // Same null-guard for task-type — keeps URL clean and avoids server-side parsing of "null".
    if (filters.taskTypeId != null) params = params.set('taskTypeId', filters.taskTypeId);
    // Coerce boolean to string explicitly — HttpParams accepts strings; relying on implicit toString would still work but this makes intent clear.
    if (filters.isClosed != null)   params = params.set('isClosed', String(filters.isClosed));
    // Return — retryTransient wraps the GET (idempotent → safe to replay on transient 5xx / network errors).
    return this.http.get<TaskListItem[]>('/api/tasks', { params }).pipe(retryTransient());
  }

  /** GET /api/tasks/{id} — full TaskDetail projection. Idempotent → safe to retry. */
  getById(id: number): Observable<TaskDetail> {
    return this.http.get<TaskDetail>(`/api/tasks/${id}`).pipe(retryTransient());
  }

  /** POST /api/tasks — creates a task at status 1. NOT retried (would risk duplicate rows). */
  create(req: CreateTaskRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>('/api/tasks', req);
  }

  /** POST /api/tasks/{id}/status — advance/rollback. NOT retried — server enforces optimistic-concurrency via RowVersion. */
  changeStatus(id: number, req: ChangeStatusRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(`/api/tasks/${id}/status`, req);
  }

  /** POST /api/tasks/{id}/close — terminal state. NOT retried. */
  close(id: number): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(`/api/tasks/${id}/close`, {});
  }

  /** POST /api/tasks/{id}/steps — edits a status's custom-data in place. NOT retried. */
  updateStep(id: number, req: UpdateStepDataRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(`/api/tasks/${id}/steps`, req);
  }
}
