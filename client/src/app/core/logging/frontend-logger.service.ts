import { Injectable, isDevMode } from '@angular/core';

/** Console wrapper. `info` is dev-only; `error` always fires. Swap point for a real SDK. */
@Injectable({ providedIn: 'root' })
export class FrontendLogger {
  info(data: Readonly<Record<string, unknown>>): void {
    if (!isDevMode()) {
      return;
    }
    console.info('[http]', data);
  }

  error(data: Readonly<Record<string, unknown>>): void {
    console.error('[http]', data);
  }
}
