import { Injectable, signal } from '@angular/core';

import { ApiError, ApiErrorKind } from '../models/api-error.model';

/** Visual tone of a toast — drives the CSS class and accessible role on ToastHostComponent. */
export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

/** Per-kind default toast titles — keeps message text focused on the detail, not the category. */
const TITLE_BY_KIND: Readonly<Record<ApiErrorKind, string>> = {
  network: 'Connection issue',
  server: 'Server error',
  'not-found': 'Not found',
  conflict: 'Conflict',
  validation: 'Check your input',
  'bad-request': 'Invalid request',
  unauthorized: 'Not signed in',
  forbidden: 'Not allowed',
  unknown: 'Something went wrong',
};
/** "Soft" error kinds that come from user input — rendered as warning, not danger, so input errors don't shout. */
const SOFT_KINDS: ReadonlySet<ApiErrorKind> = new Set(['validation', 'bad-request']);

/** Public Toast shape consumed by ToastHostComponent's template. */
export interface Toast {
  /** Monotonic id assigned at push time; used for dismiss() and *ngFor trackBy. */
  readonly id: number;
  /** Visual + a11y tone (success/info/warning/danger). */
  readonly tone: ToastTone;
  /** Body text shown to the user — should be human-readable, not a code/key. */
  readonly message: string;
  /** Optional bold header above the message; falls back to no title when absent. */
  readonly title?: string;
}

/** Caller-provided overrides for the default tone/title/ttl when pushing. */
interface PushOptions {
  /** Override the default 'info' tone (e.g. set 'success' from a mutation success path). */
  readonly tone?: ToastTone;
  /** Override the default (no) title — sets the bold header above the message. */
  readonly title?: string;
  /** Auto-dismiss delay in ms; pass 0 to keep the toast sticky until manually dismissed. */
  readonly ttlMs?: number;
}

/** Default auto-dismiss delay — long enough to read, short enough not to pile up. */
const DEFAULT_TTL = 4200;

/**
 * Signal-driven toast queue. No DOM here — ToastHostComponent reads `toasts` and renders. Soft
 * error kinds (validation, bad-request) get the warning tone instead of danger so form input
 * errors don't visually shout at the user. The store/global-error-handler are the callers.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Internal writable signal — kept private so callers must go through push/dismiss/clear. */
  private readonly _toasts = signal<readonly Toast[]>([]);
  /** Monotonic id allocator for new toasts. */
  private nextId = 1;

  /** Public read-only signal consumed by ToastHostComponent. */
  readonly toasts = this._toasts.asReadonly();

  /** Generic push — returns the assigned id so callers can dismiss programmatically. */
  push(message: string, options: PushOptions = {}): number {
    // Post-increment allocates a fresh id and advances the counter atomically (single-threaded JS guarantees no races).
    const id = this.nextId++;
    // Build the immutable Toast payload — tone defaults to 'info' so plain push() is a safe neutral notification.
    const toast: Toast = {
      id,
      tone: options.tone ?? 'info',
      message,
      title: options.title,
    };
    // Immutable update — spread into a new array so signal subscribers detect the change reference-wise.
    this._toasts.update((list) => [...list, toast]);
    // Resolve effective ttl AFTER pushing so the toast is visible even if the timer never fires (e.g. ttl=0).
    const ttl = options.ttlMs ?? DEFAULT_TTL;
    // ttl=0 means "sticky" — useful for errors the user must acknowledge.
    if (ttl > 0) {
      // Arrow captures `id` (the loop-stable value) so the timer dismisses THIS toast, not a future one with the same slot.
      setTimeout(() => this.dismiss(id), ttl);
    }
    // Return the id so callers can programmatically dismiss (e.g. on success after a "saving…" toast).
    return id;
  }

  /** Shortcut for success-tone toasts (green checkmark) — typically from mutation success paths. */
  success(message: string, title?: string): number {
    // Delegates to push so ttl/id allocation/auto-dismiss logic stays single-sourced.
    return this.push(message, { tone: 'success', title });
  }

  /** Shortcut for info-tone toasts — neutral notifications. */
  info(message: string, title?: string): number {
    // Same delegation pattern as success() — only the tone overrides differ.
    return this.push(message, { tone: 'info', title });
  }

  /** Shortcut for warning-tone toasts — used for 409 "out of sync" and soft validation errors. */
  warning(message: string, title?: string): number {
    // Warning is the "soft" rung — won't trigger danger styling but still grabs attention.
    return this.push(message, { tone: 'warning', title });
  }

  /** Shortcut for danger-tone toasts — used for hard server/network errors. */
  danger(message: string, title?: string): number {
    // Hard-failure visual — paired with longer dwell in practice via caller-supplied ttl.
    return this.push(message, { tone: 'danger', title });
  }

  /** Surfaces a typed ApiError as a toast with the right tone/title — single entry point from stores. */
  fromApiError(err: ApiError): number {
    // Soft kinds (validation/bad-request) are user-input issues — warning tone avoids visually shouting; everything else is danger.
    const tone: ToastTone = SOFT_KINDS.has(err.kind) ? 'warning' : 'danger';
    // TITLE_BY_KIND is total over ApiErrorKind, so the lookup is always defined — no fallback needed.
    return this.push(err.message, { tone, title: TITLE_BY_KIND[err.kind] });
  }

  /** Removes a single toast by id — called by the auto-dismiss timer and by the close button. */
  dismiss(id: number): void {
    // filter() returns a fresh array — reference change triggers signal subscribers; safe to call with unknown ids (no-op).
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Clears the entire queue — typically used on route changes or test teardown. */
  clear(): void {
    // Direct set with a fresh empty array — no need to read prior value.
    this._toasts.set([]);
  }
}
