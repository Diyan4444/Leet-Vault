import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubContentsService } from '../src/github/contents';
import { GitHubClient } from '../src/github/client';
import { GitHubApiError } from '../src/github/types';

describe('GitHubContentsService - Authenticated Content & Large-file Fallback', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('correctly decodes inline base64 content with Unicode support', async () => {
    const testContent = 'int main() { return 0; } // Hello 🚀';
    const base64Content = GitHubContentsService.encodeBase64(testContent);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        type: 'file',
        name: 'heap-sort.cpp',
        path: '0912-sort-an-array/heap-sort.cpp',
        sha: 'abc123sha',
        size: testContent.length,
        encoding: 'base64',
        content: base64Content,
      }),
    });

    const result = await GitHubContentsService.getFileContent(
      'mock_token',
      'user',
      'repo',
      '0912-sort-an-array/heap-sort.cpp'
    );

    expect(result).not.toBeNull();
    expect(result?.content).toBe(testContent);
    expect(result?.sha).toBe('abc123sha');
  });

  it('falls back to authenticated raw API endpoint for large/private repository files and sends Authorization header', async () => {
    const largeCode = 'class Solution { /* 2MB large code */ };';

    // Mock 1: First request returns content metadata without inline content
    // Mock 2: Second request calls raw API endpoint with Authorization headers
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          type: 'file',
          name: 'large-solution.cpp',
          path: '0912-sort-an-array/large-solution.cpp',
          sha: 'sha_large',
          size: 1500000,
          download_url: 'https://raw.githubusercontent.com/user/repo/main/0912-sort-an-array/large-solution.cpp',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => largeCode,
      });

    global.fetch = fetchMock;

    const result = await GitHubContentsService.getFileContent(
      'secret_token_123',
      'test-owner',
      'test-private-repo',
      '0912-sort-an-array/large-solution.cpp',
      'main'
    );

    expect(result).not.toBeNull();
    expect(result?.content).toBe(largeCode);
    expect(result?.sha).toBe('sha_large');

    // Verify two calls were made
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify the second (raw content) call targeted GitHub API with Authorization header, NOT an unauthenticated raw download_url
    const secondCall = fetchMock.mock.calls[1];
    const secondUrl = secondCall[0];
    const secondOptions = secondCall[1];

    expect(secondUrl).toBe(
      'https://api.github.com/repos/test-owner/test-private-repo/contents/0912-sort-an-array/large-solution.cpp?ref=main'
    );
    expect(secondOptions.headers['Authorization']).toBe('Bearer secret_token_123');
    expect(secondOptions.headers['Accept']).toBe('application/vnd.github.raw+json');
    // Verify token was NOT passed in the URL
    expect(secondUrl).not.toContain('secret_token_123');
  });

  it('handles missing or invalid authentication response properly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({
        message: 'Bad credentials',
      }),
    });

    await expect(
      GitHubContentsService.getFileContent('invalid_token', 'owner', 'repo', 'file.cpp')
    ).rejects.toThrow(GitHubApiError);
  });
});
