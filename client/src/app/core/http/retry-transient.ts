import { Observable, retry, throwError, timer } from 'rxjs';
import { ApiError } from '../models/api-error.model';

/**
 * RxJS operator factory: retries transient network/server failures with exponential backoff.
 * Wrap idempotent GETs only — mutations (create/changeStatus/close/updateStep) are NEVER retried
 * because idempotency is not guaranteed (see .claude/rules/frontend.md §3). Runs AFTER the
 * interceptor chain, so errors are already typed ApiError by the time the kind-check fires.
 * Backoff schedule: 300ms × 3^(attempt-1) — 300ms, 900ms by default (count=2).
 */
export function retryTransient<T>(count = 2): (source: Observable<T>) => Observable<T> {
  // Operator factory pattern — returns a function so callers can `.pipe(retryTransient())` without binding the source eagerly.
  return (source: Observable<T>) =>
    source.pipe(
      // retry() with delay callback gives us conditional backoff — re-subscribes to source on each retry.
      retry({
        count,
        delay: (error: unknown, attempt) => {
          // errorInterceptor already converted HttpErrorResponse → ApiError, so the kind discriminator is reliable here.
          const apiError = error as ApiError;
          // Only 'network' (status 0) and 'server' (5xx) are retried; 4xx are deterministic.
          if (apiError?.kind !== 'network' && apiError?.kind !== 'server') {
            // Re-throwing aborts the retry loop immediately — non-transient errors bubble to the caller verbatim.
            return throwError(() => error);
          }

          // Exponential backoff (300ms, 900ms, 2700ms…) — base 3 spreads retries without long tail latency on default count=2.
          return timer(300 * Math.pow(3, attempt - 1));
        },
      }),
    );
}
