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
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    }>('/user');

    return {
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
   * Fetches branches for a repository.
   */
  static async listBranches(token: string, owner: string, repo: string): Promise<GitHubBranchItem[]> {
    const client = new GitHubClient(token);
    return await client.request<GitHubBranchItem[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`
    );
  }
}
