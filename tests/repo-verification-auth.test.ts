import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubRepositoriesService } from '../src/github/repositories';
import { GitHubOAuthClient } from '../src/github/auth';
import { SyncManager } from '../src/sync/sync-manager';
import { StorageService } from '../src/shared/storage';
import { SyncRequest } from '../src/shared/types';

import { STORAGE_KEYS } from '../src/shared/constants';

// Setup chrome mock for Node environment
(global as any).chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};

describe('Authoritative Repository Write Access Verification', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects verification if token is missing', async () => {
    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('', 'testuser', 'testrepo');
    expect(res.hasWriteAccess).toBe(false);
    expect(res.error).toMatch(/Authentication required/i);
  });

  it('approves verification when user has push permissions (permissions.push: true)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        name: 'testrepo',
        full_name: 'testuser/testrepo',
        private: false,
        default_branch: 'main',
        permissions: {
          admin: false,
          push: true,
          pull: true,
        },
      }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('valid_token', 'testuser', 'testrepo');
    expect(res.hasWriteAccess).toBe(true);
    expect(res.repoItem?.full_name).toBe('testuser/testrepo');
    expect(res.repoItem?.permissions?.push).toBe(true);
  });

  it('approves verification when user has admin permissions (permissions.admin: true)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        name: 'testrepo',
        full_name: 'testuser/testrepo',
        private: false,
        default_branch: 'main',
        permissions: {
          admin: true,
          push: false,
          pull: true,
        },
      }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('valid_token', 'testuser', 'testrepo');
    expect(res.hasWriteAccess).toBe(true);
    expect(res.repoItem?.permissions?.admin).toBe(true);
  });

  it('rejects verification with explicit error when user has only read access (permissions.push: false)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 99999,
        name: 'other-repo',
        full_name: 'someone-else/other-repo',
        private: false,
        default_branch: 'main',
        permissions: {
          admin: false,
          push: false,
          pull: true,
        },
      }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('valid_token', 'someone-else', 'other-repo');
    expect(res.hasWriteAccess).toBe(false);
    expect(res.error).toMatch(/does not have permission to write/i);
  });

  it('rejects verification when repository is not found or inaccessible (404 Not Found)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('valid_token', 'unknown', 'nonexistent');
    expect(res.hasWriteAccess).toBe(false);
    expect(res.error).toMatch(/not found or inaccessible/i);
  });

  it('rejects verification when token is invalid or expired (401 Unauthorized)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ message: 'Bad credentials' }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('expired_token', 'user', 'repo');
    expect(res.hasWriteAccess).toBe(false);
    expect(res.error).toMatch(/authorization error/i);
  });

  it('rejects collaborator when ownerOnly mode is enabled', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        name: 'collab-repo',
        full_name: 'org/collab-repo',
        owner: { login: 'org' },
        permissions: { admin: false, push: true, pull: true },
      }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('valid_token', 'org', 'collab-repo', {
      ownerOnly: true,
      currentUsername: 'testuser',
    });
    expect(res.hasWriteAccess).toBe(false);
    expect(res.isOwner).toBe(false);
    expect(res.error).toMatch(/owner-only mode is enabled/i);
  });

  it('approves owner when ownerOnly mode is enabled', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        name: 'my-repo',
        full_name: 'testuser/my-repo',
        owner: { login: 'testuser' },
        permissions: { admin: true, push: true, pull: true },
      }),
    });

    const res = await GitHubRepositoriesService.verifyRepoWriteAccess('valid_token', 'testuser', 'my-repo', {
      ownerOnly: true,
      currentUsername: 'testuser',
    });
    expect(res.hasWriteAccess).toBe(true);
    expect(res.isOwner).toBe(true);
  });

  it('checks branch existence via getBranch', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        name: 'main',
        commit: { sha: 'abcd1234efgh' },
      }),
    });

    const branch = await GitHubRepositoriesService.getBranch('valid_token', 'testuser', 'my-repo', 'main');
    expect(branch).not.toBeNull();
    expect(branch?.name).toBe('main');

    // Test nonexistent branch returns null
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: async () => ({ message: 'Branch not found' }),
    });

    const nonexistent = await GitHubRepositoriesService.getBranch('valid_token', 'testuser', 'my-repo', 'fake-branch');
    expect(nonexistent).toBeNull();
  });
});

describe('GitHubOAuthClient broker URL validation and security', () => {
  it('approves trusted https vercel.app and default broker endpoints', () => {
    expect(GitHubOAuthClient.isValidBrokerUrl('https://leet-git-hub.vercel.app')).toBe(true);
    expect(GitHubOAuthClient.isValidBrokerUrl('https://custom-broker.vercel.app')).toBe(true);
  });

  it('approves localhost and 127.0.0.1 for local development', () => {
    expect(GitHubOAuthClient.isValidBrokerUrl('http://localhost:3000')).toBe(true);
    expect(GitHubOAuthClient.isValidBrokerUrl('http://127.0.0.1:3000')).toBe(true);
  });

  it('rejects untrusted domains and insecure http schemes', () => {
    expect(GitHubOAuthClient.isValidBrokerUrl('http://malicious-site.com')).toBe(false);
    expect(GitHubOAuthClient.isValidBrokerUrl('https://evil-phishing.com')).toBe(false);
    expect(GitHubOAuthClient.isValidBrokerUrl('')).toBe(false);
  });
});

describe('Pre-Sync Write Access Enforcement in SyncManager', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (chrome.storage.local.get as any).mockImplementation((_keys: any, cb?: any) => {
      const data = {
        [STORAGE_KEYS.SETTINGS]: {
          githubToken: 'test_token',
          repoConfig: {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            rootFolder: '',
            verified: false,
          },
          syncOnlyAccepted: true,
          duplicateDetection: true,
          autoSync: false,
          generateProblemReadme: true,
          updateRootReadme: true,
          theme: 'system',
        },
      };
      if (cb) cb(data);
      return Promise.resolve(data);
    });

    (chrome.storage.local.set as any).mockImplementation((_items: any, cb?: any) => {
      if (cb) cb();
      return Promise.resolve();
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockSyncRequest: SyncRequest = {
    submission: {
      submissionId: '12345',
      problem: {
        id: '912',
        slug: 'sort-an-array',
        title: 'Sort an Array',
        url: 'https://leetcode.com/problems/sort-an-array/',
        difficulty: 'Medium',
      },
      code: 'function sortArray(nums) { return nums.sort(); }',
      language: 'javascript',
      status: 'Accepted',
      timestamp: Date.now(),
    },
    customSolutionName: 'Merge Sort',
  };

  it('aborts sync when repository write access cannot be verified', async () => {
    // Mock GitHub API returning read-only permissions
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        name: 'testrepo',
        full_name: 'testowner/testrepo',
        default_branch: 'main',
        permissions: {
          push: false,
          admin: false,
          pull: true,
        },
      }),
    });

    const result = await SyncManager.syncSolution(mockSyncRequest);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not have permission to write/i);
  });
});

describe('Authoritative Connection State & Disconnect Persistence', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};
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

  it('persists verified repository configuration and timestamp', async () => {
    const verifiedTimestamp = Date.now();
    await StorageService.saveSettings({
      repoConfig: {
        owner: 'Diyan4444',
        repo: 'LeetCode',
        branch: 'main',
        rootFolder: '',
        verified: true,
        verifiedAt: verifiedTimestamp,
      },
    });

    const settings = await StorageService.getSettings();
    expect(settings.repoConfig.owner).toBe('Diyan4444');
    expect(settings.repoConfig.repo).toBe('LeetCode');
    expect(settings.repoConfig.verified).toBe(true);
    expect(settings.repoConfig.verifiedAt).toBe(verifiedTimestamp);
  });

  it('clears credentials and resets linked repository on disconnect', async () => {
    // Initial state: connected and verified
    await StorageService.saveGitHubUser({
      id: 123456,
      login: 'Diyan4444',
      name: 'Diyan',
      avatarUrl: 'https://github.com/avatar.png',
      htmlUrl: 'https://github.com/Diyan4444',
    });
    await StorageService.saveSettings({
      githubToken: 'valid_oauth_token',
      repoConfig: {
        owner: 'Diyan4444',
        repo: 'LeetCode',
        branch: 'main',
        rootFolder: '',
        verified: true,
        verifiedAt: Date.now(),
      },
    });

    // Simulate DISCONNECT_GITHUB handler
    await StorageService.saveGitHubUser(null);
    await StorageService.saveSettings({
      githubToken: undefined,
      repoConfig: {
        owner: '',
        repo: '',
        branch: 'main',
        rootFolder: '',
        verified: false,
        verifiedAt: undefined,
      },
    });

    const finalUser = await StorageService.getGitHubUser();
    const finalSettings = await StorageService.getSettings();

    expect(finalUser).toBeNull();
    expect(finalSettings.githubToken).toBeUndefined();
    expect(finalSettings.repoConfig.owner).toBe('');
    expect(finalSettings.repoConfig.repo).toBe('');
    expect(finalSettings.repoConfig.verified).toBe(false);
    expect(finalSettings.repoConfig.verifiedAt).toBeUndefined();
  });
});

