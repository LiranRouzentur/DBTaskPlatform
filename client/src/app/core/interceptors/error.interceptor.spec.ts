import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../models/api-error.model';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  async function expectFailure(
    url: string,
    flush: (req: ReturnType<HttpTestingController['expectOne']>) => void,
  ): Promise<ApiError> {
    const promise = firstValueFrom(http.get(url));
    flush(httpTesting.expectOne(url));
    try {
      await promise;
      throw new Error('expected request to fail');
    } catch (err) {
      return err as ApiError;
    }
  }

  it('maps 400 → bad-request', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush({ detail: 'Bad payload' }, { status: 400, statusText: 'Bad Request' }),
    );
    expect(err.kind).toBe('bad-request');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad payload');
  });

  it('maps 401 → unauthorized', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush({}, { status: 401, statusText: 'Unauthorized' }),
    );
    expect(err.kind).toBe('unauthorized');
  });

  it('maps 403 → forbidden', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush({}, { status: 403, statusText: 'Forbidden' }),
    );
    expect(err.kind).toBe('forbidden');
  });

  it('maps 404 → not-found', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush({}, { status: 404, statusText: 'Not Found' }),
    );
    expect(err.kind).toBe('not-found');
  });

  it('maps 409 → conflict (with rule extension)', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush(
        { detail: 'Closed', rule: 'closed-immutable' },
        { status: 409, statusText: 'Conflict' },
      ),
    );
    expect(err.kind).toBe('conflict');
    expect(err.rule).toBe('closed-immutable');
  });

  it('maps 422 → validation (with fieldErrors)', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush(
        { detail: 'invalid', errors: { receipt: ['Required.'] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      ),
    );
    expect(err.kind).toBe('validation');
    expect(err.fieldErrors?.['receipt']).toEqual(['Required.']);
  });

  it('maps 5xx → server', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush({}, { status: 500, statusText: 'Internal Server Error' }),
    );
    expect(err.kind).toBe('server');
  });

  it('maps unrecognised 4xx (e.g. 429) → unknown (not bad-request)', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush({}, { status: 429, statusText: 'Too Many Requests' }),
    );
    expect(err.kind).toBe('unknown');
    expect(err.status).toBe(429);
  });

  it('maps status=0 → network', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' }),
    );
    expect(err.kind).toBe('network');
    expect(err.status).toBe(0);
  });

  it('attaches the request X-Correlation-Id to ApiError', async () => {
    const promise = firstValueFrom(
      http.get('/api/x', { headers: { 'X-Correlation-Id': 'abc-123' } }),
    );
    const req = httpTesting.expectOne('/api/x');
    req.flush({}, { status: 500, statusText: 'Internal Server Error' });
    let err: ApiError | null = null;
    try {
      await promise;
    } catch (e) {
      err = e as ApiError;
    }
    expect(err).not.toBeNull();
    expect(err!.correlationId).toBe('abc-123');
  });

  it('falls back to statusText when ProblemDetails has no detail/title', async () => {
    const err = await expectFailure('/api/x', (r) =>
      r.flush(null, { status: 404, statusText: 'Not Found' }),
    );
    expect(err.message).toBe('Not Found');
  });
});
