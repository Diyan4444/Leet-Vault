import { GitHubClient } from './client';
import { GitHubUser } from '../shared/types';
import { GitHubRepoItem, GitHubBranchItem } from './types';

export class GitHubAuthService {
  /**
   * Validates a token by fetching the authenticated user's profile.
   */
  static async validateAndGetUser(token: string): Promise<GitHubUser> {
    const client = new GitHubClient(token);
    const user = await client.request<{
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    }>('/user');

    return {
      id: user.id,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
    };
  }
}

export class GitHubRepositoriesService {
  /**
   * Fetches user repositories (up to 100 per page, sorted by updated).
   */
  static async listRepositories(token: string): Promise<GitHubRepoItem[]> {
    const client = new GitHubClient(token);
    return await client.request<GitHubRepoItem[]>(
      '/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator'
    );
  }

  /**
   * Fetches exact repository metadata including permissions.
   */
  static async getRepository(token: string, owner: string, repo: string): Promise<GitHubRepoItem> {
    const client = new GitHubClient(token);
    return await client.request<GitHubRepoItem>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
  }

  /**
   * Authoritative verification of write (push) access for the authenticated account on the target repository.
   * Fails if repository doesn't exist, is inaccessible, or user has only read access.
   * Optionally enforces owner-only mode if enabled.
   */
  static async verifyRepoWriteAccess(
    token: string,
    owner: string,
    repo: string,
    options?: { ownerOnly?: boolean; currentUsername?: string }
  ): Promise<{ hasWriteAccess: boolean; isOwner?: boolean; repoItem?: GitHubRepoItem; error?: string }> {
    if (!token || !token.trim()) {
      return {
        hasWriteAccess: false,
        error: 'Authentication required. Please connect your GitHub account.',
      };
    }
    try {
      const repoItem = await this.getRepository(token, owner, repo);
      // Check GitHub permissions returned in authenticated repo metadata
      const hasPush = !!(repoItem.permissions?.push || repoItem.permissions?.admin);
      if (!hasPush) {
        return {
          hasWriteAccess: false,
          repoItem,
          error: 'Repository access denied. Your connected GitHub account does not have permission to write to this repository.',
        };
      }

      const isOwner = !!(
        options?.currentUsername &&
        repoItem.owner?.login?.toLowerCase() === options.currentUsername.toLowerCase()
      );

      if (options?.ownerOnly && !isOwner) {
        return {
          hasWriteAccess: false,
          isOwner: false,
          repoItem,
          error: `Repository access rejected: owner-only mode is enabled and you are a collaborator on ${owner}/${repo}, not the owner.`,
        };
      }

      return {
        hasWriteAccess: true,
        isOwner,
        repoItem,
      };
    } catch (err: any) {
      if (err.status === 404) {
        return {
          hasWriteAccess: false,
          error: `Repository ${owner}/${repo} not found or inaccessible by your GitHub account.`,
        };
      }
      if (err.status === 401 || err.status === 403) {
        return {
          hasWriteAccess: false,
          error: 'GitHub authorization error. Please check your GitHub connection permissions.',
        };
      }
      return {
        hasWriteAccess: false,
        error: err.message || 'Failed to verify repository permissions.',
      };
    }
  }

  /**
   * Fetches branches for a repository.
   */
  static async listBranches(token: string, owner: string, repo: string): Promise<GitHubBranchItem[]> {
    const client = new GitHubClient(token);
    return await client.request<GitHubBranchItem[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`
    );
  }

  /**
   * Validates if a specific branch exists in the repository.
   */
  static async getBranch(token: string, owner: string, repo: string, branch: string): Promise<GitHubBranchItem | null> {
    const client = new GitHubClient(token);
    try {
      return await client.request<GitHubBranchItem>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`
      );
    } catch {
      return null;
    }
  }
}
