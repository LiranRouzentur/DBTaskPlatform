import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ApiError } from '../models/api-error.model';
import { FrontendLogger } from '../logging/frontend-logger.service';

/**
 * MIDDLE of the interceptor chain (order: correlationId → logging → error, innermost → outermost).
 * By the time tap.error fires, errorInterceptor has already converted the HttpErrorResponse into
 * a typed ApiError — so the `apiError.kind / status / rule` access below is safe and typed.
 * Logs structured request outcomes (method, path, status, duration, correlationId) for triage.
 */
export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  // Resolved inside the functional interceptor (no class instance) — Angular's inject() runs in the interceptor context.
  const logger = inject(FrontendLogger);
  // performance.now is monotonic — safe for duration measurement even under clock skew.
  const start = performance.now();
  // Empty string fallback keeps the log shape stable when correlationIdInterceptor is somehow bypassed.
  const correlationId = req.headers.get('X-Correlation-Id') ?? '';

  return next(req).pipe(
    // tap is non-mutating — observes both branches without altering the stream.
    tap({
      next: (event) => {
        // Only log on the final HttpResponse, not intermediate HttpEvents (e.g. upload progress).
        if (event instanceof HttpResponse) {
          logger.info({
            method: req.method,
            path: req.url,
            status: event.status,
            durationMs: Math.round(performance.now() - start),
            correlationId,
          });
        }
      },
      error: (err: unknown) => {
        // errorInterceptor sits OUTSIDE this one, so by the time tap.error fires, err is already a typed ApiError.
        const apiError = err as Partial<ApiError>;
        logger.error({
          method: req.method,
          path: req.url,
          status: apiError.status ?? -1,
          kind: apiError.kind ?? 'unknown',
          rule: apiError.rule,
          durationMs: Math.round(performance.now() - start),
          correlationId,
        });
      },
    }),
  );
};
