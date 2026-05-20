import { Signal, effect, inject } from '@angular/core';

import { ApiError } from '../models/api-error.model';
import { ToastService, ToastTone } from '../services/toast.service';

// Bridges store.error() changes into toasts. Mounted via constructor() in each feature component.
// The onError hook is how change-status projects 422 fieldErrors onto dynamic-form controls.

export interface StoreErrorSurface {
  readonly error: Signal<ApiError | null>;
  readonly clearError: () => void;
}

export type ErrorTitleFn = (err: ApiError) => string;

export type ErrorToneFn = (err: ApiError) => ToastTone;

export const defaultErrorTone: ErrorToneFn = (err) => {
  if (
    err.kind === 'network' ||
    err.kind === 'conflict' ||
    err.kind === 'validation' ||
    err.kind === 'bad-request'
  ) {
    return 'warning';
  }
  return 'danger';
};

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

export function bindStoreErrorToast(
  store: StoreErrorSurface,
  title: ErrorTitleFn,
  tone: ErrorToneFn = defaultErrorTone,
  onError?: (err: ApiError) => void,
): void {
  const toasts = inject(ToastService);
  effect(() => {
    const err = store.error();
    if (!err) return;
    toasts.push(err.message, { tone: tone(err), title: title(err) });
    onError?.(err);
    store.clearError();
  });
}
