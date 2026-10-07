export interface GitHubFileCommitResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    download_url: string;
  };
  commit: {
    sha: string;
    message: string;
    html_url: string;
  };
}

export interface GitHubContentItem {
  type: 'file' | 'dir';
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  download_url: string | null;
  content?: string;
  encoding?: string;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
}

export interface GitHubBranchItem {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GitHubApiErrorPayload {
  message: string;
  documentation_url?: string;
  errors?: Array<{
    resource: string;
    field: string;
    code: string;
    message?: string;
  }>;
}

export class GitHubApiError extends Error {
  public status: number;
  public details?: GitHubApiErrorPayload;

  constructor(status: number, message: string, details?: GitHubApiErrorPayload) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.details = details;
  }
}
