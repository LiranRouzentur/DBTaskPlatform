import { Injectable, isDevMode } from '@angular/core';

/**
 * Thin console wrapper that abstracts the logging sink — the single swap point if/when a real
 * telemetry SDK (Sentry, Datadog, etc.) is wired up. `info` is suppressed in production builds
 * to keep the user's console clean; `error` always fires regardless of mode.
 */
@Injectable({ providedIn: 'root' })
export class FrontendLogger {
  /** Structured info-level log; dev-only (no-op in production builds via isDevMode()). */
  info(data: Readonly<Record<string, unknown>>): void {
    if (!isDevMode()) {
      return;
    }
    console.info('[http]', data);
  }

  /** Structured error-level log; always emitted so production incidents surface in the console. */
  error(data: Readonly<Record<string, unknown>>): void {
    console.error('[http]', data);
  }
}
