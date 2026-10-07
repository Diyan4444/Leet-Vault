import { GitHubClient } from './client';
import { GitHubContentItem, GitHubFileCommitResponse, GitHubApiError } from './types';

export class GitHubContentsService {
  /**
   * Encodes a UTF-8 string to base64 properly handling multi-byte unicode characters.
   */
  static encodeBase64(content: string): string {
    const bytes = new TextEncoder().encode(content);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Decodes a base64 string to a UTF-8 string properly handling unicode.
   */
  static decodeBase64(base64: string): string {
    const cleanBase64 = base64.replace(/\n/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  /**
   * Fetches contents of a path (either a single file or a directory list).
   * Returns null if 404 (file/dir does not exist).
   */
  static async getContents(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref = 'main'
  ): Promise<GitHubContentItem | GitHubContentItem[] | null> {
    const client = new GitHubClient(token);
    const cleanPath = path.replace(/^\/+/, '');
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}?ref=${encodeURIComponent(ref)}`;

    try {
      return await client.request<GitHubContentItem | GitHubContentItem[]>(url);
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetches raw or decoded text content of a single file.
   * Returns null if file does not exist.
   */
  static async getFileContent(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref = 'main'
  ): Promise<{ content: string; sha: string } | null> {
    const res = await this.getContents(token, owner, repo, path, ref);
    if (!res || Array.isArray(res)) {
      return null;
    }

    if (res.content && res.encoding === 'base64') {
      return {
        content: this.decodeBase64(res.content),
        sha: res.sha,
      };
    }

    // For files exceeding standard inline JSON payload (or when content is omitted),
    // fetch the raw file content securely using the authenticated GitHub API endpoint.
    // This ensures private repositories work seamlessly without leaking tokens or relying on unauthenticated download_url.
    const client = new GitHubClient(token);
    const cleanPath = path.replace(/^\/+/, '');
    const rawContentUrl = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}?ref=${encodeURIComponent(ref)}`;
    try {
      const rawText = await client.requestRawText(rawContentUrl);
      return {
        content: rawText,
        sha: res.sha,
      };
    } catch (rawErr) {
      console.warn('Failed to retrieve raw file content via authenticated GitHub API:', rawErr);
      return null;
    }
  }

  /**
   * Creates or updates a file on GitHub using PUT /repos/{owner}/{repo}/contents/{path}.
   */
  static async putFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
    commitMessage: string,
    branch = 'main',
    sha?: string
  ): Promise<GitHubFileCommitResponse> {
    const client = new GitHubClient(token);
    const cleanPath = path.replace(/^\/+/, '');
    const base64Content = this.encodeBase64(content);

    const body: Record<string, unknown> = {
      message: commitMessage,
      content: base64Content,
      branch,
    };

    if (sha) {
      body.sha = sha;
    }

    return await client.request<GitHubFileCommitResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
  }
}
