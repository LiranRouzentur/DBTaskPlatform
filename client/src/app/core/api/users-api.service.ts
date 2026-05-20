import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { retryTransient } from '../http/retry-transient';

/**
 * Seeded demo users (no user CRUD by design — assignment §2.2). Cached at bootstrap; the
 * assignee picker reads from the store, not from this service directly.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  /** Angular HttpClient — only place HttpClient is touched for user endpoints (frontend.md §3). */
  private readonly http = inject(HttpClient);

  /** GET /api/users — idempotent, retried on transient failures. */
  getAll(): Observable<User[]> {
    return this.http.get<User[]>('/api/users').pipe(retryTransient());
  }
}
