import { ErrorHandler, Injectable, inject } from '@angular/core';

import { ApiError, isApiError } from '../models/api-error.model';
import { FrontendLogger } from '../logging/frontend-logger.service';
import { ToastService } from './toast.service';

// Angular ErrorHandler override. Logs all uncaught errors; toasts ONLY for non-ApiError failures
// (ApiErrors are already toasted by the store, so re-toasting would double-announce).
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);
  private readonly logger = inject(FrontendLogger);

  handleError(error: unknown): void {
    
    const raw = unwrapAngularError(error);

    if (isApiError(raw)) {
      this.logger.error(this.toLogEntry('api', raw));
      return;
    }

    const message = raw instanceof Error ? raw.message : String(raw);
    const stack = raw instanceof Error ? raw.stack : undefined;
    this.logger.error({
      kind: 'unhandled',
      message,
      stack,
    });
    this.toasts.danger(
      'Something went wrong. Please reload if the page becomes unresponsive.',
      'Unexpected error',
    );
  }

  private toLogEntry(category: 'api', err: ApiError): Readonly<Record<string, unknown>> {
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

function unwrapAngularError(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'rejection' in error &&
    (error as { rejection?: unknown }).rejection !== undefined
  ) {
    return (error as { rejection: unknown }).rejection;
  }
  return error;
}
