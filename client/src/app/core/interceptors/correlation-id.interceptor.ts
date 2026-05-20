import { HttpInterceptorFn } from '@angular/common/http';

/**
 * FIRST in the interceptor chain (order: correlationId → logging → error, innermost → outermost).
 * Stamps each outbound request with X-Correlation-Id so server logs, frontend logs, and the
 * typed ApiError surfaced to the store can be joined together when triaging an incident.
 * Uses crypto.randomUUID where available; falls back to a Math.random base36 slice for older
 * environments (the fallback is not cryptographically strong but is sufficient for log joining).
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  // Short-circuit when an upstream caller (replay tooling, e2e harness) already supplied an id — don't overwrite it.
  if (req.headers.has('X-Correlation-Id')) {
    // Pass through untouched so the upstream id propagates end-to-end.
    return next(req);
  }

  // Prefer crypto.randomUUID for collision-resistance; fall back to Math.random for legacy environments (non-secure contexts).
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  // Clone with setHeaders (HttpRequest is immutable) — downstream interceptors and the server now see the stamped id.
  return next(req.clone({ setHeaders: { 'X-Correlation-Id': id } }));
};
