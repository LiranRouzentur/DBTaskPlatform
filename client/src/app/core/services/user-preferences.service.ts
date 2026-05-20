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
    // try/catch wraps the entire body — localStorage access itself throws in sandboxed/private contexts (Safari), not just the parse.
    try {
      // Raw string straight from storage — may be null (never written), the sentinel, or a numeric id as text.
      const raw = localStorage.getItem(STORAGE_KEY);
      // Never-written case → tri-state null means "no preference, treat as default".
      if (raw === null) return null;
      // Sentinel branch distinguishes "explicitly chose All Users" from "never chose" — needed by bootstrap to skip restoring an id.
      if (raw === ALL_USERS_SENTINEL) return 'all';
      // Numeric branch — parse the persisted id back to a number for downstream comparison with users list.
      const n = Number(raw);
      // Defensive: guard against stale/corrupted values (negative, NaN, float).
      return Number.isInteger(n) && n > 0 ? n : null;
    } catch {
      // Storage access threw (private browsing, disabled cookies, sandboxed iframe) — degrade to "no preference".
      return null;
    }
  }

  /** Persists a new selection (numeric id or `null` → All Users). Swallows storage exceptions. */
  writeCurrentUserId(userId: number | null): void {
    // try wraps the writes — setItem can throw on quota-exceeded or in private-browsing mode.
    try {
      // null → explicitly chose "All Users"; store the sentinel so readSelection can distinguish from never-written.
      if (userId === null) {
        localStorage.setItem(STORAGE_KEY, ALL_USERS_SENTINEL);
      } else {
        // Numeric id is coerced to string — localStorage only stores strings.
        localStorage.setItem(STORAGE_KEY, String(userId));
      }
    } catch {
      // Private-browsing / quota-exceeded — silently no-op; selection is in-memory only this session.
    }
  }
}
