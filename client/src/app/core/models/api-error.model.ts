// Mirrors backend RFC 7807 ProblemDetails. `rule` is the kebab-case WorkflowError key;
// `errors` is the 422 per-field messages (renamed to `fieldErrors` by the interceptor).

export interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;

  readonly rule?: string;

  readonly errors?: Readonly<Record<string, readonly string[]>>;

  readonly traceId?: string;
}

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

export interface ApiError {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly message: string;
  readonly rule?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  
  readonly traceId?: string;
  
  readonly correlationId?: string;
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApiError>;
  return (
    typeof candidate.kind === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.message === 'string'
  );
}
