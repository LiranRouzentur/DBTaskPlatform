import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TaskDetail, TaskListItem } from '../core/models/task.model';
import { TasksStore } from './tasks.store';

describe('TasksStore', () => {
  let httpTesting: HttpTestingController;
  let store: InstanceType<typeof TasksStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(TasksStore);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('setCurrentUser fires a single filtered GET and stores the list', async () => {
    const userId = 1;
    const fakeTask: TaskListItem = {
      id: 42,
      taskTypeId: 1,
      status: 1,
      isClosed: false,
      assignedUserId: userId,
      updatedAtUtc: '2026-05-19T00:00:00Z',
    };

    const loadPromise = store.setCurrentUser(userId);

    const req = httpTesting.expectOne((r) =>
      r.url === '/api/tasks' && r.params.get('userId') === String(userId),
    );
    expect(req.request.method).toBe('GET');
    req.flush([fakeTask]);

    await loadPromise;

    expect(store.tasks().length).toBe(1);
    expect(store.tasks()[0].id).toBe(42);
    expect(store.currentUserId()).toBe(userId);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('loadDetail dedupes concurrent calls for the same id (no infinite loop)', async () => {
    
    const id = 4;
    const detail: TaskDetail = {
      id,
      taskTypeId: 1,
      status: 1,
      isClosed: false,
      assignedUserId: 1,
      updatedAtUtc: '2026-05-19T00:00:00Z',
      customDataByStatus: {},
      assigneeByStatus: { 1: 1 },
      retiredStatuses: [],
    };

    const first = store.loadDetail(id);
    const second = store.loadDetail(id);

    const req = httpTesting.expectOne(`/api/tasks/${id}`);
    expect(req.request.method).toBe('GET');
    req.flush(detail);

    const [a, b] = await Promise.all([first, second]);

    expect(a?.id).toBe(id);
    expect(b).toBeNull();
    expect(store.detailById()[id]?.id).toBe(id);
    expect(store.detailLoadingIds().has(id)).toBe(false);

    void store.loadDetail(id);
    const second_req = httpTesting.expectOne(`/api/tasks/${id}`);
    second_req.flush(detail);
  });
});
