import { HttpInterceptorFn } from '@angular/common/http';

/**
 * FIRST in the interceptor chain (order: correlationId → logging → error, innermost → outermost).
 * Stamps each outbound request with X-Correlation-Id so server logs, frontend logs, and the
 * typed ApiError surfaced to the store can be joined together when triaging an incident.
 * Uses crypto.randomUUID where available; falls back to a Math.random base36 slice for older
 * environments (the fallback is not cryptographically strong but is sufficient for log joining).
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  // Respect an upstream-supplied header — useful for replay/debug tooling.
  if (req.headers.has('X-Correlation-Id')) {
    return next(req);
  }

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return next(req.clone({ setHeaders: { 'X-Correlation-Id': id } }));
};
