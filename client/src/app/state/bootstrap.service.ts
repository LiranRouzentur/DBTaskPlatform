import { Injectable, inject } from '@angular/core';

import { UserPreferencesService } from '../core/services/user-preferences.service';
import { TasksStore } from './tasks.store';

/**
 * App-init orchestrator wired into `provideAppInitializer` in `app.config.ts`. Loads task-type and user metadata
 * in parallel, then resolves the stored user preference and fires the initial task-list GET. This is the only
 * place that decides "what's loaded before the UI renders" — features assume metadata is present.
 */
@Injectable({ providedIn: 'root' })
export class BootstrapService {
  /** Shared signal-store — populated here before any feature mounts. */
  private readonly store = inject(TasksStore);
  /** Reads the persisted current-user id (localStorage) so the previous session's filter sticks across reloads. */
  private readonly prefs = inject(UserPreferencesService);

  /** Top-level boot entry — parallel metadata fetch then user resolution. Awaited by the app initializer. */
  async bootstrapApp(): Promise<void> {
    await Promise.all([this.store.loadTaskTypes(), this.store.loadUsers()]);
    await this.resolveInitialUser();
  }

  /** Picks the initial active user: a valid stored selection, otherwise "All users" (triggers a plain list load). */
  private async resolveInitialUser(): Promise<void> {
    const selection = this.prefs.readSelection();
    const users = this.store.users();

    let initialUserId: number | null = null;
    if (typeof selection === 'number') {
      const stored = users.find((u) => u.id === selection);
      if (stored) initialUserId = stored.id;
    }

    if (initialUserId !== null) {
      // setCurrentUser persists the choice AND fires the list fetch — no separate load() needed.
      await this.store.setCurrentUser(initialUserId);
    } else {
      await this.store.load();
    }
  }
}
