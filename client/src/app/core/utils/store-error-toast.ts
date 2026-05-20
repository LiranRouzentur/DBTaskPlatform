import { Signal, effect, inject } from '@angular/core';

import { ApiError } from '../models/api-error.model';
import { ToastService, ToastTone } from '../services/toast.service';

// Bridges store.error() changes into toasts. Mounted via constructor() in each feature component.
// The onError hook is how change-status projects 422 fieldErrors onto dynamic-form controls.

/** Minimal surface this helper needs from any store — keeps it decoupled from a specific store type. */
export interface StoreErrorSurface {
  /** Reactive handle on the last surfaced ApiError; `null` after clearError or a successful op. */
  readonly error: Signal<ApiError | null>;
  /** Resets the error signal so the toast doesn't re-fire on later effect runs. */
  readonly clearError: () => void;
}

/** Caller-supplied function that picks a toast title from the typed error (e.g. "Couldn't create task"). */
export type ErrorTitleFn = (err: ApiError) => string;

/** Caller-supplied function that picks a toast tone — `warning` for user-correctable, `danger` for server faults. */
export type ErrorToneFn = (err: ApiError) => ToastTone;

/** Default tone classifier — soft-fail (warning) for expected user-facing errors, danger for everything else. */
export const defaultErrorTone: ErrorToneFn = (err) => {
  // User-recoverable kinds — retry, refresh, fix input, etc. Soft tone keeps the UI from feeling broken.
  if (
    err.kind === 'network' ||
    err.kind === 'conflict' ||
    err.kind === 'validation' ||
    err.kind === 'bad-request'
  ) {
    return 'warning';
  }
  // Everything else (server faults, unknowns) is a real failure — escalate to danger.
  return 'danger';
};

/** Factory that returns a title-picker preset for common error kinds, falling back to `fallback` for the rest. */
export const defaultErrorTitle =
  (fallback: string): ErrorTitleFn =>
  (err) =>
    err.kind === 'network'
      ? 'Connection problem'
      : err.kind === 'conflict'
        ? 'Out of sync'
        : err.kind === 'validation'
          ? 'Validation failed'
          : fallback;

/** Single subscription point: pushes a toast when `store.error` flips non-null, then clears it.
 *  `onError` is the projection hook (e.g. change-status uses it to map 422 fieldErrors onto form controls). */
export function bindStoreErrorToast(
  store: StoreErrorSurface,
  title: ErrorTitleFn,
  tone: ErrorToneFn = defaultErrorTone,
  onError?: (err: ApiError) => void,
): void {
  // Toast host injected once at binding time — keeps the effect callback closure small.
  const toasts = inject(ToastService);
  effect(() => {
    // Read the signal first so Angular registers the dependency before any early-return.
    const err = store.error();
    // No error → nothing to surface; quiet exit avoids spurious toasts on the cleared state.
    if (!err) return;
    // Tone + title callbacks let each feature personalise the message without forking the helper.
    toasts.push(err.message, { tone: tone(err), title: title(err) });
    // Optional projection hook — change-status uses this to map 422 fieldErrors onto form controls.
    onError?.(err);
    // Clear after handling so the next error (even same shape) triggers the effect again.
    store.clearError();
  });
}
