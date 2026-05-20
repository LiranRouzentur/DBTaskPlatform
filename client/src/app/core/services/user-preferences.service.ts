import { Injectable } from '@angular/core';

const STORAGE_KEY = 'tp.currentUserId';

const ALL_USERS_SENTINEL = '__all__';

export type StoredUserSelection = number | null | 'all';

// Persists the user picker across reloads. localStorage may throw (private browsing) — every
// access is try/catch'd and silently no-ops, defaulting to "All Users".
@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  
  readSelection(): StoredUserSelection {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      if (raw === ALL_USERS_SENTINEL) return 'all';
      const n = Number(raw);
      return Number.isInteger(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  writeCurrentUserId(userId: number | null): void {
    try {
      if (userId === null) {
        localStorage.setItem(STORAGE_KEY, ALL_USERS_SENTINEL);
      } else {
        localStorage.setItem(STORAGE_KEY, String(userId));
      }
    } catch {

    }
  }
}
