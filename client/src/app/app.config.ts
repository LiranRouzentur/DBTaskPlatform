import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { correlationIdInterceptor } from './core/interceptors/correlation-id.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loggingInterceptor } from './core/interceptors/logging.interceptor';
import { GlobalErrorHandler } from './core/services/global-error-handler.service';
import { BootstrapService } from './state/bootstrap.service';
import { routes } from './app.routes';

/**
 * Composition root for the Angular app. `withComponentInputBinding()` is required so
 * modal route params (e.g. `:id`) flow into components via `input()` — see frontend.md §5.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    /** Coalesces multiple zone events per microtask — reduces redundant change-detection passes. */
    provideZoneChangeDetection({ eventCoalescing: true }),
    /** Route table + component input binding so modals receive `:id` as a typed `input()`. */
    provideRouter(routes, withComponentInputBinding()),
    // Interceptor chain order: correlationId → logging → error (innermost). errorInterceptor is
    // last so it sees the raw HttpErrorResponse and normalises every failure to ApiError.
    provideHttpClient(
      withInterceptors([
        correlationIdInterceptor,
        loggingInterceptor,
        errorInterceptor,
      ]),
    ),

    // Custom ErrorHandler avoids re-logging ApiErrors the store already toasted.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    /** Pre-render bootstrap: loads task-types + users before the first route activates. */
    provideAppInitializer(() => inject(BootstrapService).bootstrapApp()),
  ],
};
