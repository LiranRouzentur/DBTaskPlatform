import { ErrorHandler, Injectable, inject } from '@angular/core';

import { ApiError, isApiError } from '../models/api-error.model';
import { FrontendLogger } from '../logging/frontend-logger.service';
import { ToastService } from './toast.service';

/**
 * Overrides Angular's default ErrorHandler. Logs every uncaught error, but toasts ONLY for
 * non-ApiError failures — ApiErrors are already toasted by the store (see tasks.store.ts
 * runMutation/runQuery), so re-toasting here would double-announce the same incident.
 * See .claude/rules/frontend.md §8.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  /** Toast sink for unexpected (non-API) errors — user-facing fallback message. */
  private readonly toasts = inject(ToastService);
  /** Structured logger for both API errors and unhandled exceptions. */
  private readonly logger = inject(FrontendLogger);

  /** Angular ErrorHandler entry point — invoked for every uncaught exception/rejection. */
  handleError(error: unknown): void {

    // Unwrap Angular's rejection-wrapper so downstream isApiError sees the real inner value.
    const raw = unwrapAngularError(error);

    // ApiErrors flow through here from observable subscriptions; log only — the store already toasted.
    if (isApiError(raw)) {
      this.logger.error(this.toLogEntry('api', raw));
      // Early-return prevents the catch-all danger toast below — avoids double-announcing a store-handled error.
      return;
    }

    // Error instances carry .message/.stack; non-Error throws (strings, plain objects) get stringified for log readability.
    const message = raw instanceof Error ? raw.message : String(raw);
    // Stack only exists on real Error instances — undefined for thrown primitives.
    const stack = raw instanceof Error ? raw.stack : undefined;
    this.logger.error({
      kind: 'unhandled',
      message,
      stack,
    });
    // Generic fallback toast — the message is intentionally vague (no PII / internal detail leaked to the user).
    this.toasts.danger(
      'Something went wrong. Please reload if the page becomes unresponsive.',
      'Unexpected error',
    );
  }

  /** Builds a redacted log entry for an ApiError — no PII, just the triage-critical fields. */
  private toLogEntry(category: 'api', err: ApiError): Readonly<Record<string, unknown>> {
    // Deliberately excludes `message` and `fieldErrors` — those can contain user input; the ids are sufficient for joining server logs.
    return {
      kind: category,
      apiKind: err.kind,
      status: err.status,
      rule: err.rule,
      correlationId: err.correlationId,
      traceId: err.traceId,
    };
  }
}

/**
 * Angular wraps async/promise rejections in an object with a `rejection` field — unwrap it so
 * isApiError can recognise the inner typed error. Sync errors pass through unchanged.
 */
function unwrapAngularError(error: unknown): unknown {
  // Structural check — Angular's zone-wrapper isn't exported as a class, so we sniff for the `rejection` key.
  if (
    typeof error === 'object' &&
    error !== null &&
    'rejection' in error &&
    (error as { rejection?: unknown }).rejection !== undefined
  ) {
    // Return the inner rejection — this is the original thrown/rejected value.
    return (error as { rejection: unknown }).rejection;
  }
  // Not a zone-wrapped rejection (e.g. a sync throw inside a component) — pass through verbatim.
  return error;
}
