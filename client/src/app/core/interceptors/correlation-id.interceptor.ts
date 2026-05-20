import { HttpInterceptorFn } from '@angular/common/http';

// First in the chain. Stamps each request with X-Correlation-Id so server logs and ApiError
// can be joined for triage. randomUUID where available, degraded fallback otherwise.
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('X-Correlation-Id')) {
    return next(req);
  }

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return next(req.clone({ setHeaders: { 'X-Correlation-Id': id } }));
};
