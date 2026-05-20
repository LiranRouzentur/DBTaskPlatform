import { signal } from '@angular/core';

/** Single-slot dialog state; generic TKey makes `is(key)` template checks compile-time-safe.
 *  Used by feature components to drive at-most-one-popover-open semantics (user picker, type picker, etc.). */
export class DialogState<TKey extends string> {
  /** Internal writable signal — holds the currently-open key, or `null` when nothing is open. */
  private readonly _active = signal<TKey | null>(null);
  /** Readonly view of `_active` exposed to templates; prevents external writes. */
  readonly active = this._active.asReadonly();

  /** Template guard — returns true when `key` is the currently-open dialog. */
  is(key: TKey): boolean {
    // Strict equality so callers can use the same string literal type in templates and component logic.
    return this._active() === key;
  }

  /** Opens `key`, replacing any other dialog that was open. Enforces the single-slot invariant. */
  open(key: TKey): void {
    // Direct overwrite — opening a second dialog implicitly closes the first (single-slot semantics).
    this._active.set(key);
  }

  /** Closes the active dialog (no-op when nothing was open). */
  close(): void {
    // `null` is the "nothing open" sentinel; resetting it is idempotent.
    this._active.set(null);
  }
}
