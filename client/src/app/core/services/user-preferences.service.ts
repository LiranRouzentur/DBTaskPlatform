import { Injectable } from '@angular/core';

/** localStorage key — namespaced with `tp.` (task-platform) to avoid collisions on shared origins. */
const STORAGE_KEY = 'tp.currentUserId';

/** Sentinel string distinguishing "explicitly chose All Users" from "never picked / cleared". */
const ALL_USERS_SENTINEL = '__all__';

/** Tri-state for the persisted picker: a numeric id, `'all'` (chose All Users), or `null` (no preference). */
export type StoredUserSelection = number | null | 'all';

/**
 * Persists the user-picker selection across reloads. Every localStorage access is try/catch'd
 * because localStorage throws in private-browsing / sandboxed contexts (Safari, iframes); on
 * failure we silently no-op and the UI falls back to the "All Users" default.
 */
@Injectable({ providedIn: 'root' })
export class UserPreferencesService {

  /** Loads the persisted selection at app start; returns null on any parse/storage failure. */
  readSelection(): StoredUserSelection {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      if (raw === ALL_USERS_SENTINEL) return 'all';
      const n = Number(raw);
      // Defensive: guard against stale/corrupted values (negative, NaN, float).
      return Number.isInteger(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  /** Persists a new selection (numeric id or `null` → All Users). Swallows storage exceptions. */
  writeCurrentUserId(userId: number | null): void {
    try {
      if (userId === null) {
        localStorage.setItem(STORAGE_KEY, ALL_USERS_SENTINEL);
      } else {
        localStorage.setItem(STORAGE_KEY, String(userId));
      }
    } catch {
      // Private-browsing / quota-exceeded — silently no-op; selection is in-memory only this session.
    }
  }
}
