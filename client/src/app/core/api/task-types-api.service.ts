import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TaskTypeMetadata } from '../models/task-type-metadata.model';
import { retryTransient } from '../http/retry-transient';

/**
 * Loads the task-type schema (status definitions + field specs) that drives the dynamic form.
 * Called once at bootstrap by TasksStore.loadTaskTypes — the response is cached in the store.
 * This is the extensibility seam: new task types appear here as DB rows, not Angular code (project.md §3).
 */
@Injectable({ providedIn: 'root' })
export class TaskTypesApi {
  /** Angular HttpClient — only place HttpClient is touched for task-type endpoints (frontend.md §3). */
  private readonly http = inject(HttpClient);

  /** GET /api/task-types — idempotent, retried on transient network/5xx failures. */
  getAll(): Observable<TaskTypeMetadata[]> {
    return this.http.get<TaskTypeMetadata[]>('/api/task-types').pipe(retryTransient());
  }
}
