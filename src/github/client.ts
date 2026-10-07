import { GitHubApiError, GitHubApiErrorPayload } from './types';

export class GitHubClient {
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor(token: string) {
    this.token = token.trim();
  }

  /**
   * Safe fetch with standard GitHub API headers, authentication, and structured error handling.
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${this.token}`,
      ...(options.headers as Record<string, string>),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle Rate Limiting headers if available
      const remaining = response.headers.get('x-ratelimit-remaining');
      const resetTime = response.headers.get('x-ratelimit-reset');
      if (response.status === 403 && remaining === '0') {
        const resetDate = resetTime ? new Date(parseInt(resetTime, 10) * 1000).toLocaleTimeString() : 'soon';
        throw new GitHubApiError(
          403,
          `GitHub API rate limit exceeded. Resets at ${resetDate}.`
        );
      }

      if (!response.ok) {
        let errorData: GitHubApiErrorPayload | undefined;
        try {
          errorData = await response.json();
        } catch {
          // Response body was not JSON
        }

        const msg = errorData?.message || `GitHub API request failed with status ${response.status}`;
        throw new GitHubApiError(response.status, msg, errorData);
      }

      // If status 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof GitHubApiError) {
        throw err;
      }
      throw new GitHubApiError(0, `Network or connection failure: ${(err as Error).message}`);
    }
  }

  /**
   * Fetches raw text from GitHub API with authentication headers (e.g. raw blob or contents).
   */
  async requestRawText(endpoint: string, options: RequestInit = {}): Promise<string> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${this.token}`,
      ...(options.headers as Record<string, string>),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new GitHubApiError(
          response.status,
          `GitHub raw request failed with status ${response.status}`
        );
      }

      return await response.text();
    } catch (err: unknown) {
      if (err instanceof GitHubApiError) {
        throw err;
      }
      throw new GitHubApiError(0, `Network or connection failure: ${(err as Error).message}`);
    }
  }
}
