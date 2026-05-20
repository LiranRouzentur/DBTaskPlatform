import { defer, firstValueFrom, of, throwError } from 'rxjs';
import { fakeAsync, tick } from '@angular/core/testing';
import { ApiError } from '../models/api-error.model';
import { retryTransient } from './retry-transient';

function networkError(): ApiError {
  return { kind: 'network', status: 0, message: 'offline' };
}
function serverError(): ApiError {
  return { kind: 'server', status: 500, message: 'boom' };
}
function clientError(kind: ApiError['kind'], status: number): ApiError {
  return { kind, status, message: 'no retry' };
}

describe('retryTransient', () => {
  it('retries network errors and succeeds on the 2nd try', fakeAsync(() => {
    let attempts = 0;
    let resolved: number | null = null;

    defer(() => {
      attempts++;
      return attempts < 2 ? throwError(() => networkError()) : of(42);
    })
      .pipe(retryTransient(2))
      .subscribe({ next: (v) => (resolved = v) });

    tick(300);
    expect(attempts).toBe(2);
    expect(resolved).toBe(42);
  }));

  it('retries server errors up to count, then emits the last error', fakeAsync(() => {
    let attempts = 0;
    let observed: ApiError | null = null;

    defer(() => {
      attempts++;
      return throwError(() => serverError());
    })
      .pipe(retryTransient(2))
      .subscribe({
        error: (e: ApiError) => (observed = e),
      });

    tick(0);        
    tick(300);      
    tick(900);      
    expect(attempts).toBe(3);     
    expect(observed!.kind).toBe('server');
  }));

  it('does NOT retry 4xx (bad-request, validation, conflict, not-found, unauthorized)', async () => {
    const cases: ReadonlyArray<{ kind: ApiError['kind']; status: number }> = [
      { kind: 'bad-request', status: 400 },
      { kind: 'unauthorized', status: 401 },
      { kind: 'not-found', status: 404 },
      { kind: 'conflict', status: 409 },
      { kind: 'validation', status: 422 },
    ];
    for (const { kind, status } of cases) {
      let attempts = 0;
      const observed = await firstValueFrom(
        defer(() => {
          attempts++;
          return throwError(() => clientError(kind, status));
        }).pipe(retryTransient(2)),
      ).catch((e: ApiError) => e);
      expect(observed.kind).toBe(kind);
      expect(attempts).toBe(1);
    }
  });

  it('backoff is 300ms then 900ms (300 * 3^(attempt-1))', fakeAsync(() => {
    const times: number[] = [];
    const start = Date.now();
    let attempts = 0;

    defer(() => {
      times.push(Date.now() - start);
      attempts++;
      return attempts <= 2 ? throwError(() => networkError()) : of('done');
    })
      .pipe(retryTransient(2))
      .subscribe({ next: () => undefined });

    tick(0);     
    expect(times).toEqual([0]);
    tick(299);
    expect(times.length).toBe(1);
    tick(1);     
    expect(times.length).toBe(2);
    expect(times[1]).toBeGreaterThanOrEqual(300);
    tick(899);
    expect(times.length).toBe(2);
    tick(1);     
    expect(times.length).toBe(3);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(900);
  }));
});
