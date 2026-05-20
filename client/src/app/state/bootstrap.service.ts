import { Injectable, inject } from '@angular/core';

import { UserPreferencesService } from '../core/services/user-preferences.service';
import { TasksStore } from './tasks.store';

/** App-initializer. Loads metadata in parallel, resolves stored user, fires the initial list GET. */
@Injectable({ providedIn: 'root' })
export class BootstrapService {
  private readonly store = inject(TasksStore);
  private readonly prefs = inject(UserPreferencesService);

  async bootstrapApp(): Promise<void> {
    await Promise.all([this.store.loadTaskTypes(), this.store.loadUsers()]);
    await this.resolveInitialUser();
  }

  private async resolveInitialUser(): Promise<void> {
    const selection = this.prefs.readSelection();
    const users = this.store.users();

    let initialUserId: number | null = null;
    if (typeof selection === 'number') {
      const stored = users.find((u) => u.id === selection);
      if (stored) initialUserId = stored.id;
    }

    if (initialUserId !== null) {
      await this.store.setCurrentUser(initialUserId);
    } else {
      await this.store.load();
    }
  }
}
