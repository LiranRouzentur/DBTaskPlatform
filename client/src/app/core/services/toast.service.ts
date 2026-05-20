import { Injectable, signal } from '@angular/core';

import { ApiError, ApiErrorKind } from '../models/api-error.model';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

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
const SOFT_KINDS: ReadonlySet<ApiErrorKind> = new Set(['validation', 'bad-request']);

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  readonly title?: string;
}

interface PushOptions {
  readonly tone?: ToastTone;
  readonly title?: string;
  readonly ttlMs?: number;
}

const DEFAULT_TTL = 4200;

// Signal-driven toast queue. No DOM here — ToastHostComponent renders the list. Soft kinds
// (validation, bad-request) get warning tone instead of danger so input errors don't shout.
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<readonly Toast[]>([]);
  private nextId = 1;

  readonly toasts = this._toasts.asReadonly();

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
    if (ttl > 0) {
      setTimeout(() => this.dismiss(id), ttl);
    }
    return id;
  }

  success(message: string, title?: string): number {
    return this.push(message, { tone: 'success', title });
  }

  info(message: string, title?: string): number {
    return this.push(message, { tone: 'info', title });
  }

  warning(message: string, title?: string): number {
    return this.push(message, { tone: 'warning', title });
  }

  danger(message: string, title?: string): number {
    return this.push(message, { tone: 'danger', title });
  }

  fromApiError(err: ApiError): number {
    const tone: ToastTone = SOFT_KINDS.has(err.kind) ? 'warning' : 'danger';
    return this.push(err.message, { tone, title: TITLE_BY_KIND[err.kind] });
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    this._toasts.set([]);
  }
}
