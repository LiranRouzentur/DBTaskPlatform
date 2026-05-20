import { signal } from '@angular/core';

/** Single-slot dialog state; generic TKey makes `is(key)` template checks compile-time-safe. */
export class DialogState<TKey extends string> {
  private readonly _active = signal<TKey | null>(null);
  readonly active = this._active.asReadonly();

  is(key: TKey): boolean {
    return this._active() === key;
  }

  open(key: TKey): void {
    this._active.set(key);
  }

  close(): void {
    this._active.set(null);
  }
}
