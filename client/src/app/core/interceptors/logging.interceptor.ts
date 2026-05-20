import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ApiError } from '../models/api-error.model';
import { FrontendLogger } from '../logging/frontend-logger.service';

// Sits between correlationId and error. By the time tap.error runs, errorInterceptor has
// already converted the failure to ApiError, so the typed access below is safe.
export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(FrontendLogger);
  const start = performance.now();
  const correlationId = req.headers.get('X-Correlation-Id') ?? '';

  return next(req).pipe(
    tap({
      next: (event) => {
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
