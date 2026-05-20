import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { retryTransient } from '../http/retry-transient';
import { ChangeStatusRequest } from '../models/change-status-request.model';
import { CreateTaskRequest } from '../models/create-task-request.model';
import { TaskDetail, TaskListItem } from '../models/task.model';
import { UpdateStepDataRequest } from '../models/update-step-data-request.model';

export interface TaskListFilters {
  readonly userId?: number | null;
  readonly taskTypeId?: number | null;
  readonly isClosed?: boolean | null;
}

// Only place HttpClient is touched for task endpoints. GETs are wrapped in retryTransient
// (network/5xx with exponential backoff); mutations are NOT — retrying a POST could double-write.
@Injectable({ providedIn: 'root' })
export class TaskApi {
  private readonly http = inject(HttpClient);

  list(filters: TaskListFilters = {}): Observable<TaskListItem[]> {
    let params = new HttpParams();
    if (filters.userId != null)     params = params.set('userId', filters.userId);
    if (filters.taskTypeId != null) params = params.set('taskTypeId', filters.taskTypeId);
    if (filters.isClosed != null)   params = params.set('isClosed', String(filters.isClosed));
    return this.http.get<TaskListItem[]>('/api/tasks', { params }).pipe(retryTransient());
  }

  getById(id: number): Observable<TaskDetail> {
    return this.http.get<TaskDetail>(`/api/tasks/${id}`).pipe(retryTransient());
  }

  create(req: CreateTaskRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>('/api/tasks', req);
  }

  changeStatus(id: number, req: ChangeStatusRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(`/api/tasks/${id}/status`, req);
  }

  close(id: number): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(`/api/tasks/${id}/close`, {});
  }

  updateStep(id: number, req: UpdateStepDataRequest): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(`/api/tasks/${id}/steps`, req);
  }
}
