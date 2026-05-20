/**
 * Mirrors backend RFC 7807 ProblemDetails (project.md §2). `rule` is the kebab-case
 * WorkflowError key; `errors` is the 422 per-field messages (renamed to `fieldErrors`
 * on the normalised ApiError below).
 */
export interface ProblemDetails {
  /** RFC 7807 problem URI — centralised in server's ProblemTypes; pattern-matched by the interceptor. */
  readonly type?: string;
  /** Human-readable short title (e.g. "Concurrent modification"). */
  readonly title?: string;
  /** HTTP status code echo. */
  readonly status?: number;
  /** Long-form human description; safe to surface in toasts. */
  readonly detail?: string;
  /** Path/URI of the offending request (rarely used client-side). */
  readonly instance?: string;

  /** Kebab-case rule key — the contract surface client validators mirror (project.md §2). */
  readonly rule?: string;

  /** 422 per-field messages: `{ "customData.amount": ["must be > 0"] }`. */
  readonly errors?: Readonly<Record<string, readonly string[]>>;

  /** Server-side trace id — included in logs and shown in dev toasts for cross-referencing. */
  readonly traceId?: string;
}

/** Classifier the error-interceptor stamps on every failure; stores switch on this instead of HTTP status. */
export type ApiErrorKind =
  | 'network'
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'server'
  | 'unknown';

/** Typed envelope all stores / components see — never a raw HttpErrorResponse (frontend.md §8). */
export interface ApiError {
  /** Coarse category — drives toast level (warning vs error) and store recovery logic (e.g. 409 → refetch). */
  readonly kind: ApiErrorKind;
  /** HTTP status code (0 for network/CORS failures). */
  readonly status: number;
  /** Best message to show the user (derived from ProblemDetails.detail/title or a network fallback). */
  readonly message: string;
  /** Kebab-case rule key — store reads this to branch on e.g. 'concurrent-modification'. */
  readonly rule?: string;
  /** 422 per-field messages projected onto reactive-form controls as `{ server: messages }` (frontend.md §6). */
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  /** Server-side trace id for support / log correlation. */
  readonly traceId?: string;

  /** Client-side correlation id added by correlationIdInterceptor; threads request → server logs → ApiError. */
  readonly correlationId?: string;
}

/** Type-guard so `GlobalErrorHandler` can distinguish our typed errors from raw Errors. */
export function isApiError(value: unknown): value is ApiError {
  // Reject primitives and null up front — `typeof null === 'object'` so the explicit null check is required.
  if (typeof value !== 'object' || value === null) return false;
  // Narrow to a Partial so we can probe required fields without TS complaints (still `unknown` at runtime).
  const candidate = value as Partial<ApiError>;
  // Require the three load-bearing fields. Anything missing one is treated as a raw Error so the global handler logs it instead of trusting it.
  return (
    typeof candidate.kind === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.message === 'string'
  );
}
