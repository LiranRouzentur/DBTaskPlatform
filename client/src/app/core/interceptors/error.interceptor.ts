import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError, ApiErrorKind, ProblemDetails } from '../models/api-error.model';

/**
 * OUTERMOST in the interceptor chain (order: correlationId → logging → error). Normalises every
 * HttpErrorResponse into a typed ApiError so stores/components never see raw HttpErrorResponse.
 * Server 422 ProblemDetails carries field errors under `errors` (RFC 7807); we surface them as
 * ApiError.fieldErrors — the rename is intentional, keep both sides aligned.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  // Carry the correlation id onto the typed error so the store can include it in toasts/logs.
  const correlationId = req.headers.get('X-Correlation-Id') ?? undefined;
  return next(req).pipe(
    catchError((err: HttpErrorResponse) =>
      throwError(() => toApiError(err, correlationId)),
    ),
  );
};

/** Maps an Angular HttpErrorResponse into the app's typed ApiError envelope. */
function toApiError(err: HttpErrorResponse, correlationId: string | undefined): ApiError {
  // status === 0 means the request never reached the server (offline, CORS, DNS, etc.).
  if (err.status === 0) {
    return {
      kind: 'network',
      status: 0,
      message: 'Network unavailable.',
      correlationId,
    };
  }

  const problem = isProblemDetails(err.error) ? err.error : null;
  // Prefer the server's `detail` (most specific), then `title`, then HTTP statusText.
  const message =
    problem?.detail ?? problem?.title ?? err.statusText ?? 'Request failed.';

  return {
    kind: classify(err.status),
    status: err.status,
    message,
    rule: problem?.rule,
    fieldErrors: problem?.errors,
    traceId: problem?.traceId,
    correlationId,
  };
}

/** Structural type-guard for RFC 7807 ProblemDetails payloads. */
function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('title' in value || 'detail' in value || 'status' in value)
  );
}

/** Maps HTTP status codes to the app's discriminated-union ApiErrorKind. See requirements.md §7. */
function classify(status: number): ApiErrorKind {
  if (status === 400) return 'bad-request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status >= 500) return 'server';

  return 'unknown';
}
