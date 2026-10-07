import {
  SyncRequest,
  SyncResult,
  ProblemDirectoryState,
  ExistingSolutionFile,
  LeetCodeProblem,
} from '../shared/types';
import { StorageService } from '../shared/storage';
import { GitHubContentsService } from '../github/contents';
import { GitHubRepositoriesService } from '../github/repositories';
import { GitHubContentItem } from '../github/types';
import { resolveLanguage } from '../leetcode/language-map';
import { FilenameManager } from './filename-manager';
import { DuplicateDetector } from './duplicate-detector';
import { ReadmeGenerator, SolutionRowData } from './readme-generator';
import { formatProblemFolderName } from '../utils/sanitize';
import { STORAGE_KEYS } from '../shared/constants';

export class SyncManager {
  /**
   * Discovers existing files and state for a problem in the user's GitHub repository.
   */
  static async getProblemDirectoryState(
    problemId: string,
    problemSlug: string
  ): Promise<ProblemDirectoryState> {
    const settings = await StorageService.getSettings();
    const token = settings.githubToken;
    const { owner, repo, branch, rootFolder } = settings.repoConfig;

    const folderName = formatProblemFolderName(problemId, problemSlug);
    const folderPath = rootFolder && rootFolder !== '/'
      ? `${rootFolder.replace(/^\/+|\/+$/g, '')}/${folderName}`
      : folderName;

    if (!token || !owner || !repo) {
      return {
        folderName,
        folderPath,
        files: [],
        readmeExists: false,
      };
    }

    try {
      const contents = await GitHubContentsService.getContents(
        token,
        owner,
        repo,
        folderPath,
        branch
      );

      const items: GitHubContentItem[] = Array.isArray(contents) ? contents : [];
      const files: ExistingSolutionFile[] = items.map((item: GitHubContentItem) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size,
        downloadUrl: item.download_url || undefined,
      }));

      const readme = files.find((f) => f.name.toLowerCase() === 'readme.md');

      return {
        folderName,
        folderPath,
        files,
        readmeExists: !!readme,
        readmeSha: readme ? readme.sha : undefined,
      };
    } catch (err: unknown) {
      // 404 means the folder does not exist yet (clean new problem)
      return {
        folderName,
        folderPath,
        files: [],
        readmeExists: false,
      };
    }
  }

  /**
   * Main sync workflow:
   * 1. Check directory state
   * 2. Verify duplicate code (unless forced)
   * 3. Resolve target filename (custom name or solution-N)
   * 4. Check filename collisions
   * 5. Upload/commit solution file to GitHub
   * 6. Generate/update problem README.md
   * 7. Maintain repository root README.md
   * 8. Save to sync history
   */
  static async syncSolution(request: SyncRequest): Promise<SyncResult> {
    const settings = await StorageService.getSettings();
    const user = await StorageService.getGitHubUser();
    const token = settings.githubToken;
    const { owner, repo, branch, rootFolder } = settings.repoConfig;

    if (!token || !owner || !repo) {
      return {
        success: false,
        fileName: '',
        filePath: '',
        error: 'GitHub repository or authentication is not configured in Settings.',
      };
    }

    // Security check 1: Verify authenticated push access immediately before every write
    const writeCheck = await GitHubRepositoriesService.verifyRepoWriteAccess(
      token,
      owner,
      repo,
      {
        ownerOnly: settings.ownerOnlyMode,
        currentUsername: user?.login,
      }
    );

    if (!writeCheck.hasWriteAccess) {
      // Invalidate stored verification
      await StorageService.saveSettings({
        repoConfig: {
          ...settings.repoConfig,
          verified: false,
        },
      });
      return {
        success: false,
        fileName: '',
        filePath: '',
        error: writeCheck.error || 'Repository access denied. Write permission required.',
      };
    }

    // Security check 2: Verify target branch still exists before committing
    const targetBranch = branch || 'main';
    const branchCheck = await GitHubRepositoriesService.getBranch(token, owner, repo, targetBranch);
    if (!branchCheck) {
      return {
        success: false,
        fileName: '',
        filePath: '',
        error: `Selected branch "${targetBranch}" does not exist in repository ${owner}/${repo}. Please select an existing branch.`,
      };
    }

    const { submission, customSolutionName, overwriteSha, forceSaveAnyway } = request;
    const { problem, code, language, runtime, memory } = submission;

    const dirState = await this.getProblemDirectoryState(problem.id, problem.slug);
    const langConfig = resolveLanguage(language);

    // 1. Check for Duplicate Code if enabled and not explicitly bypassed
    if (settings.duplicateDetection && !forceSaveAnyway && !overwriteSha) {
      const dupCheck = await DuplicateDetector.checkDuplicateCode(
        code,
        dirState.files,
        token,
        owner,
        repo,
        targetBranch
      );

      if (dupCheck.isDuplicate && dupCheck.matchingFileName) {
        return {
          success: false,
          fileName: dupCheck.matchingFileName,
          filePath: `${dirState.folderPath}/${dupCheck.matchingFileName}`,
          conflictType: 'DUPLICATE_CODE',
          existingSolutionName: dupCheck.matchingFileName,
          error: `This solution already exists as "${dupCheck.matchingFileName}".`,
        };
      }
    }

    // 2. Resolve Target Filename
    const { fileName, solutionName } = FilenameManager.resolveTargetFilename(
      customSolutionName,
      dirState.files,
      language
    );

    const fullFilePath = `${dirState.folderPath}/${fileName}`;

    // 3. Filename collision check
    const existingFile = FilenameManager.findConflictingFile(fileName, dirState.files);
    if (existingFile && !overwriteSha) {
      return {
        success: false,
        fileName,
        filePath: fullFilePath,
        conflictType: 'DUPLICATE_NAME',
        existingSolutionName: existingFile.name,
        error: `A solution file named "${fileName}" already exists on GitHub.`,
      };
    }

    // 4. Generate Commit Message
    const actionVerb = (existingFile || overwriteSha) ? 'Update' : 'Add';
    const commitMessage = `${actionVerb} ${solutionName} solution for ${problem.title}`;

    try {
      // 5. Commit Solution File
      const targetSha = overwriteSha || (existingFile ? existingFile.sha : undefined);
      const commitRes = await GitHubContentsService.putFile(
        token,
        owner,
        repo,
        fullFilePath,
        code,
        commitMessage,
        targetBranch,
        targetSha
      );

      const githubFileUrl = `https://github.com/${owner}/${repo}/blob/${targetBranch}/${fullFilePath}`;

      // 6. Update Problem README if setting is enabled
      let solutionCount = dirState.files.filter((f) => f.name.toLowerCase() !== 'readme.md').length;
      if (!existingFile && !overwriteSha) {
        solutionCount += 1;
      }
      if (solutionCount < 1) solutionCount = 1;

      if (settings.generateProblemReadme) {
        await this.syncProblemReadme(
          token,
          owner,
          repo,
          targetBranch,
          dirState,
          request,
          fileName,
          solutionName
        );
      }

      // 7. Maintain repository root README if enabled
      if (settings.updateRootReadme) {
        await this.syncRootReadme(
          token,
          owner,
          repo,
          targetBranch,
          problem,
          dirState.folderName,
          solutionCount
        );
      }

      // 8. Record to Sync History
      await StorageService.addSyncHistory({
        id: `${Date.now()}-${problem.id}`,
        problemId: problem.id,
        problemTitle: problem.title,
        solutionName,
        fileName,
        language: langConfig.name,
        runtime,
        memory,
        githubUrl: githubFileUrl,
        timestamp: Date.now(),
      });

      return {
        success: true,
        fileName,
        filePath: fullFilePath,
        commitSha: commitRes.commit.sha,
        githubUrl: githubFileUrl,
      };
    } catch (err: unknown) {
      console.error('GitHub file upload error:', err);
      const errMsg = (err as Error).message || 'Failed to push solution to GitHub';

      // Check if error is a temporary network or GitHub server/rate-limit error
      const isTemporary =
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('NetworkError') ||
        errMsg.includes('network') ||
        errMsg.includes('500') ||
        errMsg.includes('502') ||
        errMsg.includes('503') ||
        errMsg.includes('504') ||
        errMsg.includes('429') ||
        errMsg.includes('rate limit');

      if (isTemporary) {
        // Enqueue into pending queue for retry
        await StorageService.enqueuePendingItem({
          id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
          request,
          error: errMsg,
          retryCount: 0,
          repositoryOwner: owner,
          repositoryName: repo,
          branch: targetBranch,
          lastAttemptAt: Date.now(),
        });

        return {
          success: false,
          fileName,
          filePath: fullFilePath,
          conflictType: 'GITHUB_ERROR',
          queuedForRetry: true,
          error: `Temporary GitHub error: ${errMsg}. Solution has been safely saved to Pending Queue.`,
        };
      }

      return {
        success: false,
        fileName,
        filePath: fullFilePath,
        conflictType: 'GITHUB_ERROR',
        error: errMsg,
      };
    }
  }

  /**
   * Helper to generate/update problem README
   */
  private static async syncProblemReadme(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    dirState: ProblemDirectoryState,
    request: SyncRequest,
    currentFileName: string,
    currentSolutionName: string
  ): Promise<void> {
    try {
      const readmePath = `${dirState.folderPath}/README.md`;
      const existingSolutions: SolutionRowData[] = [];

      // Collect existing non-readme files
      for (let i = 0; i < dirState.files.length; i++) {
        const f = dirState.files[i];
        if (f.name.toLowerCase() === 'readme.md') continue;
        if (f.name.toLowerCase() === currentFileName.toLowerCase()) continue;

        existingSolutions.push({
          number: i + 1,
          name: f.name.replace(/\.[^/.]+$/, '').replace(/-/g, ' '),
          filename: f.name,
          language: resolveLanguage(f.name.split('.').pop() || '').name,
        });
      }

      // Append current solution
      existingSolutions.push({
        number: existingSolutions.length + 1,
        name: currentSolutionName,
        filename: currentFileName,
        language: resolveLanguage(request.submission.language).name,
        runtime: request.submission.runtime,
        memory: request.submission.memory,
      });

      const readmeMd = ReadmeGenerator.generateProblemReadme(
        request.submission.problem,
        existingSolutions
      );

      // Check for current readme sha
      let currentSha = dirState.readmeSha;
      if (!currentSha) {
        const curFile = await GitHubContentsService.getFileContent(
          token,
          owner,
          repo,
          readmePath,
          branch
        );
        if (curFile) {
          currentSha = curFile.sha;
        }
      }

      await GitHubContentsService.putFile(
        token,
        owner,
        repo,
        readmePath,
        readmeMd,
        `Update README for ${request.submission.problem.title}`,
        branch,
        currentSha
      );
    } catch (readmeErr) {
      console.warn('Failed to update problem README (non-fatal):', readmeErr);
    }
  }

  /**
   * Helper to maintain repository root README.md
   */
  private static async syncRootReadme(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    problem: LeetCodeProblem,
    problemFolder: string,
    solutionCount: number
  ): Promise<void> {
    try {
      const rootReadmeFile = await GitHubContentsService.getFileContent(
        token,
        owner,
        repo,
        'README.md',
        branch
      );

      const existingContent = rootReadmeFile?.content || '';
      const rootSha = rootReadmeFile?.sha;

      // Parse existing problem entries from table to prevent duplicates
      const problemMap = new Map<string, { id: string; title: string; folder: string; difficulty?: string; count: number }>();

      const rowRegex = /\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\(\.\/([^)]+)\)\s*\|\s*([^|]*)\s*\|\s*(\d+)\s*\|/g;
      let match: RegExpExecArray | null;
      while ((match = rowRegex.exec(existingContent)) !== null) {
        problemMap.set(match[1], {
          id: match[1],
          title: match[2].trim(),
          folder: match[3].trim(),
          difficulty: match[4].trim(),
          count: parseInt(match[5], 10) || 1,
        });
      }

      // Add or update current problem in map
      problemMap.set(problem.id, {
        id: problem.id,
        title: problem.title,
        folder: problemFolder,
        difficulty: problem.difficulty || 'Medium',
        count: solutionCount,
      });

      const updatedList = Array.from(problemMap.values());
      const newRootContent = ReadmeGenerator.updateRootReadmeContent(existingContent, updatedList);

      await GitHubContentsService.putFile(
        token,
        owner,
        repo,
        'README.md',
        newRootContent,
        `Update root README for ${problem.title}`,
        branch,
        rootSha
      );
    } catch (rootErr) {
      console.warn('Failed to update root README (non-fatal):', rootErr);
    }
  }

  /**
   * Retries syncing a specific queued pending item
   */
  static async retryPendingItem(id: string): Promise<SyncResult> {
    const queue = await StorageService.getPendingQueue();
    const item = queue.find((q) => q.id === id);
    if (!item) {
      return {
        success: false,
        fileName: '',
        filePath: '',
        error: 'Queued item not found.',
      };
    }

    const result = await this.syncSolution(item.request);
    if (result.success) {
      await StorageService.removePendingItem(id);
    } else {
      const updatedQueue = queue.map((q) => {
        if (q.id === id) {
          return {
            ...q,
            retryCount: q.retryCount + 1,
            error: result.error || 'Retry attempt failed',
            lastAttemptAt: Date.now(),
          };
        }
        return q;
      });
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_QUEUE]: updatedQueue });
      }
    }
    return result;
  }
}
