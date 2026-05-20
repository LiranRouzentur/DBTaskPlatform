import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError, ApiErrorKind, ProblemDetails } from '../models/api-error.model';

// Normalises every HttpErrorResponse → typed ApiError. The server's 422 ProblemDetails carries
// field errors under "errors" (RFC 7807); we expose them as ApiError.fieldErrors. The rename is
// intentional — keep both sides.
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId = req.headers.get('X-Correlation-Id') ?? undefined;
  return next(req).pipe(
    catchError((err: HttpErrorResponse) =>
      throwError(() => toApiError(err, correlationId)),
    ),
  );
};

function toApiError(err: HttpErrorResponse, correlationId: string | undefined): ApiError {
  if (err.status === 0) {
    return {
      kind: 'network',
      status: 0,
      message: 'Network unavailable.',
      correlationId,
    };
  }

  const problem = isProblemDetails(err.error) ? err.error : null;
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

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('title' in value || 'detail' in value || 'status' in value)
  );
}

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
