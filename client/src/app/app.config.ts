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

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
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
    provideAppInitializer(() => inject(BootstrapService).bootstrapApp()),
  ],
};
