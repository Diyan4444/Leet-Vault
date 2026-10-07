export interface LeetCodeProblem {
  id: string; // e.g., "912"
  title: string; // e.g., "Sort an Array"
  slug: string; // e.g., "sort-an-array"
  url: string; // e.g., "https://leetcode.com/problems/sort-an-array/"
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

export interface LeetCodeSubmission {
  problem: LeetCodeProblem;
  code: string;
  language: string; // e.g., "cpp", "python3"
  status: 'Accepted' | 'Wrong Answer' | 'Time Limit Exceeded' | 'Memory Limit Exceeded' | 'Runtime Error' | 'Compilation Error' | 'Unknown';
  runtime?: string; // e.g., "12 ms"
  runtimePercentile?: string; // e.g., "85.4%"
  memory?: string; // e.g., "20.1 MB"
  memoryPercentile?: string; // e.g., "90.2%"
  timestamp: number;
  submissionId?: string;
}

export interface GitHubRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  rootFolder: string; // default "/" or "solutions"
  verified?: boolean;
  verifiedAt?: number;
}

export interface GitHubUser {
  id?: number | string;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface ConnectionState {
  connected: boolean;
  githubUserId?: number | string;
  githubUsername?: string;
  githubAvatarUrl?: string;

  repositoryOwner?: string;
  repositoryName?: string;
  repositoryUrl?: string;

  repositoryVerified: boolean;
  hasPushAccess: boolean;
  isOwner?: boolean;

  selectedBranch?: string;

  verifiedAt?: number;
  lastVerifiedAt?: number;
}

export interface ExistingSolutionFile {
  name: string; // e.g., "heap-sort.cpp"
  path: string; // full path in repo
  sha: string;
  size: number;
  downloadUrl?: string;
}

export interface ProblemDirectoryState {
  folderName: string;
  folderPath: string;
  files: ExistingSolutionFile[];
  readmeExists: boolean;
  readmeSha?: string;
}

export interface SyncRequest {
  submission: LeetCodeSubmission;
  customSolutionName?: string; // e.g. "Heap Sort"
  overwriteSha?: string; // If replacing an existing file
  forceSaveAnyway?: boolean;
  cachedDirState?: ProblemDirectoryState;
}

export interface SyncResult {
  success: boolean;
  fileName: string;
  filePath: string;
  commitSha?: string;
  githubUrl?: string;
  error?: string;
  warning?: string;
  problemReadmeUpdated?: boolean;
  rootReadmeUpdated?: boolean;
  conflictType?: 'DUPLICATE_NAME' | 'DUPLICATE_CODE' | 'GITHUB_ERROR';
  existingSolutionName?: string;
  queuedForRetry?: boolean;
}

export interface PendingQueueItem {
  id: string;
  createdAt: number;
  request: SyncRequest;
  error?: string;
  retryCount: number;
  repositoryOwner?: string;
  repositoryName?: string;
  branch?: string;
  lastAttemptAt?: number;
}

export interface ExtensionSettings {
  githubToken?: string; // OAuth access token
  authMethod: 'oauth';
  repoConfig: GitHubRepoConfig;
  autoSync: boolean;
  syncOnlyAccepted: boolean;
  duplicateDetection: boolean;
  generateProblemReadme: boolean;
  updateRootReadme: boolean;
  includeRuntimeInReadme: boolean;
  includeMemoryInReadme: boolean;
  theme: 'light' | 'dark' | 'system';
  ownerOnlyMode?: boolean;
  oauthBrokerUrl?: string;
}

export interface SyncHistoryItem {
  id: string;
  problemId: string;
  problemTitle: string;
  solutionName: string;
  fileName: string;
  language: string;
  runtime?: string;
  memory?: string;
  githubUrl: string;
  timestamp: number;
}
