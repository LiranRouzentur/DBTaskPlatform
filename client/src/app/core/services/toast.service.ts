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
    const id = this.nextId++;
    const toast: Toast = {
      id,
      tone: options.tone ?? 'info',
      message,
      title: options.title,
    };
    this._toasts.update((list) => [...list, toast]);
    const ttl = options.ttlMs ?? DEFAULT_TTL;
    // ttl=0 means "sticky" — useful for errors the user must acknowledge.
    if (ttl > 0) {
      setTimeout(() => this.dismiss(id), ttl);
    }
    return id;
  }

  /** Shortcut for success-tone toasts (green checkmark) — typically from mutation success paths. */
  success(message: string, title?: string): number {
    return this.push(message, { tone: 'success', title });
  }

  /** Shortcut for info-tone toasts — neutral notifications. */
  info(message: string, title?: string): number {
    return this.push(message, { tone: 'info', title });
  }

  /** Shortcut for warning-tone toasts — used for 409 "out of sync" and soft validation errors. */
  warning(message: string, title?: string): number {
    return this.push(message, { tone: 'warning', title });
  }

  /** Shortcut for danger-tone toasts — used for hard server/network errors. */
  danger(message: string, title?: string): number {
    return this.push(message, { tone: 'danger', title });
  }

  /** Surfaces a typed ApiError as a toast with the right tone/title — single entry point from stores. */
  fromApiError(err: ApiError): number {
    const tone: ToastTone = SOFT_KINDS.has(err.kind) ? 'warning' : 'danger';
    return this.push(err.message, { tone, title: TITLE_BY_KIND[err.kind] });
  }

  /** Removes a single toast by id — called by the auto-dismiss timer and by the close button. */
  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Clears the entire queue — typically used on route changes or test teardown. */
  clear(): void {
    this._toasts.set([]);
  }
}
