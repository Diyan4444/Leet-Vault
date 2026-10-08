import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncManager } from '../src/sync/sync-manager';
import { StorageService } from '../src/shared/storage';
import { STORAGE_KEYS } from '../src/shared/constants';
import { SyncRequest, PendingQueueItem } from '../src/shared/types';

(global as any).chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};

describe('Pending Sync Queue and Retry Actions', () => {
  let mockStorage: Record<string, any> = {};
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {
      [STORAGE_KEYS.SETTINGS]: {
        githubToken: 'valid_token',
        repoConfig: {
          owner: 'testowner',
          repo: 'testrepo',
          branch: 'main',
          rootFolder: '',
          verified: true,
        },
        syncOnlyAccepted: true,
        duplicateDetection: true,
        autoSync: false,
        generateProblemReadme: true,
        updateRootReadme: true,
        theme: 'system',
      },
      [STORAGE_KEYS.GITHUB_USER]: {
        login: 'testowner',
        id: 12345,
      },
      [STORAGE_KEYS.PENDING_QUEUE]: [],
    };

    (chrome.storage.local.get as any).mockImplementation((key: string, cb?: any) => {
      const data = { [key]: mockStorage[key] };
      if (cb) cb(data);
      return Promise.resolve(data);
    });

    (chrome.storage.local.set as any).mockImplementation((items: Record<string, any>, cb?: any) => {
      Object.assign(mockStorage, items);
      if (cb) cb();
      return Promise.resolve();
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockRequest: SyncRequest = {
    submission: {
      submissionId: 'sub_123',
      problem: {
        id: '912',
        slug: 'sort-an-array',
        title: 'Sort an Array',
        url: 'https://leetcode.com/problems/sort-an-array/',
        difficulty: 'Medium',
      },
      code: 'int main() { return 0; }',
      language: 'cpp',
      status: 'Accepted',
      runtime: '12 ms',
      memory: '20 MB',
      timestamp: Date.now(),
    },
    customSolutionName: 'Quick Sort',
  };

  it('enqueues item into pending queue when GitHub upload encounters a temporary network error', async () => {
    // Mock repo verify & branch check succeeding
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          id: 123,
          full_name: 'testowner/testrepo',
          default_branch: 'main',
          permissions: { push: true, admin: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ name: 'main' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404, // getProblemDirectoryState returns empty
        headers: new Headers(),
        json: async () => ({ message: 'Not Found' }),
      })
      .mockRejectedValueOnce(new Error('Failed to fetch (network offline)'));

    const result = await SyncManager.syncSolution(mockRequest);

    expect(result.success).toBe(false);
    expect(result.queuedForRetry).toBe(true);

    const queue = await StorageService.getPendingQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].request.customSolutionName).toBe('Quick Sort');
    expect(queue[0].error).toContain('Failed to fetch');
    expect(queue[0].retryCount).toBe(0);
  });

  it('retries queued item and removes it on successful sync', async () => {
    const queueItem: PendingQueueItem = {
      id: 'queue_1',
      createdAt: Date.now(),
      request: mockRequest,
      error: 'Temporary 500 server error',
      retryCount: 1,
      repositoryOwner: 'testowner',
      repositoryName: 'testrepo',
      branch: 'main',
    };
    mockStorage[STORAGE_KEYS.PENDING_QUEUE] = [queueItem];

    // Mock all calls succeeding on retry:
    // 1. verifyRepoWriteAccess
    // 2. getBranch
    // 3. getProblemDirectoryState
    // 4. putFile (solution)
    // 5. getFileContent (README)
    // 6. putFile (problem README)
    // 7. getFileContent (root README)
    // 8. putFile (root README)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          id: 123,
          full_name: 'testowner/testrepo',
          permissions: { push: true, admin: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ name: 'main' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ message: 'Not Found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({
          content: { sha: 'sha_new_solution' },
          commit: { sha: 'commit_123' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ message: 'Not Found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({
          content: { sha: 'sha_readme' },
          commit: { sha: 'commit_readme' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ message: 'Not Found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({
          content: { sha: 'sha_root' },
          commit: { sha: 'commit_root' },
        }),
      });

    const result = await SyncManager.retryPendingItem('queue_1');
    expect(result.success).toBe(true);

    const queueAfter = await StorageService.getPendingQueue();
    expect(queueAfter.length).toBe(0);
  });

  it('updates attemptCount and retains item in queue if retry fails', async () => {
    const queueItem: PendingQueueItem = {
      id: 'queue_fail_1',
      createdAt: Date.now(),
      request: mockRequest,
      error: 'First error',
      retryCount: 0,
    };
    mockStorage[STORAGE_KEYS.PENDING_QUEUE] = [queueItem];

    // Mock API failing during retry (e.g. branch missing)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          id: 123,
          full_name: 'testowner/testrepo',
          permissions: { push: true, admin: true },
        }),
      })
      .mockRejectedValueOnce(new Error('Branch not found'));

    const result = await SyncManager.retryPendingItem('queue_fail_1');
    expect(result.success).toBe(false);

    const queueAfter = await StorageService.getPendingQueue();
    expect(queueAfter.length).toBe(1);
    expect(queueAfter[0].retryCount).toBe(1);
    expect(queueAfter[0].error).toContain('Selected branch "main" does not exist');
  });

  it('updates existing queue item without spawning duplicate when retry encounters temporary error', async () => {
    const queueItem: PendingQueueItem = {
      id: 'queue_retry_temp_1',
      createdAt: Date.now(),
      request: mockRequest,
      error: 'Previous temporary network error',
      retryCount: 0,
    };
    mockStorage[STORAGE_KEYS.PENDING_QUEUE] = [queueItem];

    // Mock API failing with temporary network error
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (network offline)'));

    const result = await SyncManager.retryPendingItem('queue_retry_temp_1');
    expect(result.success).toBe(false);

    const queueAfter = await StorageService.getPendingQueue();
    expect(queueAfter.length).toBe(1);
    expect(queueAfter[0].id).toBe('queue_retry_temp_1');
    expect(queueAfter[0].retryCount).toBe(1);
    expect(queueAfter[0].error).toContain('Failed to fetch');
  });

  it('removes item from queue when manually cleared', async () => {
    mockStorage[STORAGE_KEYS.PENDING_QUEUE] = [
      { id: 'item_to_remove', createdAt: Date.now(), request: mockRequest, retryCount: 0 },
    ];

    await StorageService.removePendingItem('item_to_remove');

    const queue = await StorageService.getPendingQueue();
    expect(queue.length).toBe(0);
  });

  it('processPendingQueueAutoRetry respects exponential backoff and skips items too recent', async () => {
    // Item created just 1 second ago with retryCount 1 (needs at least 120s backoff)
    const recentItem: PendingQueueItem = {
      id: 'recent_1',
      createdAt: Date.now() - 1000,
      lastAttemptAt: Date.now() - 1000,
      request: mockRequest,
      retryCount: 1,
    };
    mockStorage[STORAGE_KEYS.PENDING_QUEUE] = [recentItem];

    const result = await SyncManager.processPendingQueueAutoRetry(5);
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });

  it('processPendingQueueAutoRetry skips items that reached maxRetries', async () => {
    const deadLetterItem: PendingQueueItem = {
      id: 'dead_1',
      createdAt: Date.now() - 1000000,
      lastAttemptAt: Date.now() - 500000,
      request: mockRequest,
      retryCount: 5,
    };
    mockStorage[STORAGE_KEYS.PENDING_QUEUE] = [deadLetterItem];

    const result = await SyncManager.processPendingQueueAutoRetry(5);
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });
});

