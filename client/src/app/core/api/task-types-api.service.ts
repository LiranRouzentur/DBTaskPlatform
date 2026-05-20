import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TaskTypeMetadata } from '../models/task-type-metadata.model';
import { retryTransient } from '../http/retry-transient';

// Loads the task-type schema (status definitions + field specs) that drives the dynamic form.
// Called once at bootstrap by TasksStore.loadTaskTypes — the response is cached in the store.
@Injectable({ providedIn: 'root' })
export class TaskTypesApi {
  private readonly http = inject(HttpClient);

  getAll(): Observable<TaskTypeMetadata[]> {
    return this.http.get<TaskTypeMetadata[]>('/api/task-types').pipe(retryTransient());
  }
}
