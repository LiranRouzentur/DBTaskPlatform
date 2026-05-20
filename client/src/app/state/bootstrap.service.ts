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
    // Parallel fetch — task-types and users are independent; sequencing would add latency for no reason.
    await Promise.all([this.store.loadTaskTypes(), this.store.loadUsers()]);
    // Must run AFTER the users list lands — resolveInitialUser validates the stored id against `store.users()`.
    await this.resolveInitialUser();
  }

  /** Picks the initial active user: a valid stored selection, otherwise "All users" (triggers a plain list load). */
  private async resolveInitialUser(): Promise<void> {
    // Last-known user id read from localStorage (or `null` for "All Users" / `undefined` if nothing stored / storage unavailable).
    const selection = this.prefs.readSelection();
    // Snapshot the just-loaded users list — used to validate the stored id still exists (user may have been deleted between sessions).
    const users = this.store.users();

    // Resolved id we'll activate. Stays null when there's no valid stored selection — that maps to "All Users".
    let initialUserId: number | null = null;
    // Only a numeric selection is a real user id; `null` here means the user explicitly chose "All Users" last session — keep it null.
    if (typeof selection === 'number') {
      // Defensive lookup: stored id may reference a user that no longer exists; fall through to "All Users" if so.
      const stored = users.find((u) => u.id === selection);
      if (stored) initialUserId = stored.id;
    }

    if (initialUserId !== null) {
      // setCurrentUser persists the choice AND fires the list fetch — no separate load() needed.
      await this.store.setCurrentUser(initialUserId);
    } else {
      // "All Users" path — currentUserId stays null (its initial value), so just load the unfiltered list.
      await this.store.load();
    }
  }
}
