import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ApiError } from '../models/api-error.model';
import { FrontendLogger } from '../logging/frontend-logger.service';
import { GlobalErrorHandler } from './global-error-handler.service';
import { ToastService } from './toast.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let toasts: ToastService;
  let logger: FrontendLogger;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler],
    });
    handler = TestBed.inject(GlobalErrorHandler);
    toasts = TestBed.inject(ToastService);
    logger = TestBed.inject(FrontendLogger);
  });

  it('filters ApiError — logs but does NOT push a toast (store→effect path already surfaces it)', () => {
    const apiErr: ApiError = {
      kind: 'server',
      status: 500,
      message: 'Boom',
      correlationId: 'abc-123',
    };
    const dangerSpy = vi.spyOn(toasts, 'danger');
    const logSpy = vi.spyOn(logger, 'error');

    handler.handleError(apiErr);

    expect(dangerSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logArg = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logArg['kind']).toBe('api');
    expect(logArg['apiKind']).toBe('server');
    expect(logArg['correlationId']).toBe('abc-123');
  });

  it('toasts and logs a thrown Error', () => {
    const dangerSpy = vi.spyOn(toasts, 'danger');
    const logSpy = vi.spyOn(logger, 'error');
    const err = new Error('Template binding failure');

    handler.handleError(err);

    expect(dangerSpy).toHaveBeenCalledTimes(1);
    const [message, title] = dangerSpy.mock.calls[0];
    expect(message).toContain('Something went wrong');
    expect(title).toBe('Unexpected error');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logArg = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logArg['kind']).toBe('unhandled');
    expect(logArg['message']).toBe('Template binding failure');
    expect(logArg['stack']).toBeDefined();
  });

  it('toasts and logs a non-Error thrown value (string)', () => {
    const dangerSpy = vi.spyOn(toasts, 'danger');
    const logSpy = vi.spyOn(logger, 'error');

    handler.handleError('something weird');

    expect(dangerSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logArg = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logArg['message']).toBe('something weird');
    expect(logArg['stack']).toBeUndefined();
  });

  it('unwraps Angular-style { rejection } errors so the inner ApiError is recognised', () => {
    const apiErr: ApiError = {
      kind: 'network',
      status: 0,
      message: 'offline',
    };
    const dangerSpy = vi.spyOn(toasts, 'danger');
    const logSpy = vi.spyOn(logger, 'error');

    handler.handleError({ rejection: apiErr });

    expect(dangerSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logArg = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logArg['apiKind']).toBe('network');
  });
});
