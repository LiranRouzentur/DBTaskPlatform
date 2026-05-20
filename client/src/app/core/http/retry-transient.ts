import { Observable, retry, throwError, timer } from 'rxjs';
import { ApiError } from '../models/api-error.model';

// RxJS operator for idempotent GETs only (NEVER mutations). Runs after the interceptor chain,
// so failures are already typed ApiError when the kind-check fires. Backoff: 300ms × 3^(attempt-1).
export function retryTransient<T>(count = 2): (source: Observable<T>) => Observable<T> {
  return (source: Observable<T>) =>
    source.pipe(
      retry({
        count,
        delay: (error: unknown, attempt) => {
          const apiError = error as ApiError;
          if (apiError?.kind !== 'network' && apiError?.kind !== 'server') {
            return throwError(() => error);
          }
          
          return timer(300 * Math.pow(3, attempt - 1));
        },
      }),
    );
}
