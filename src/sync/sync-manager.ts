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
import { formatProblemFolderName, sanitizeRootFolder } from '../utils/sanitize';
import { STORAGE_KEYS } from '../shared/constants';
import { PerformanceProfiler } from '../utils/profiler';
import { computeCodeHash } from '../utils/hashing';

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

    const sanitizedRoot = sanitizeRootFolder(rootFolder);
    const folderName = formatProblemFolderName(problemId, problemSlug);
    const folderPath = sanitizedRoot ? `${sanitizedRoot}/${folderName}` : folderName;

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
  static async syncSolution(
    request: SyncRequest,
    options?: { isRetry?: boolean }
  ): Promise<SyncResult> {
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

    PerformanceProfiler.mark('t5_authRetrieved');

    // Security check 1 & 2: Intelligent Cached Repository & Branch Verification
    // Valid for 10 minutes if already verified and repository parameters haven't changed.
    const isVerificationValid =
      !!settings.repoConfig.verified &&
      !!settings.repoConfig.verifiedAt &&
      Date.now() - settings.repoConfig.verifiedAt < 10 * 60 * 1000 &&
      settings.repoConfig.owner.toLowerCase() === owner.toLowerCase() &&
      settings.repoConfig.repo.toLowerCase() === repo.toLowerCase();

    if (!isVerificationValid) {
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

      // Update cached verification timestamp
      await StorageService.saveSettings({
        repoConfig: {
          ...settings.repoConfig,
          verified: true,
          verifiedAt: Date.now(),
        },
      });
    }

    PerformanceProfiler.mark('t6_repoVerified');

    // Security check 2: Verify target branch
    const targetBranch = branch || 'main';
    if (!isVerificationValid || settings.repoConfig.branch !== targetBranch) {
      const branchCheck = await GitHubRepositoriesService.getBranch(token, owner, repo, targetBranch);
      if (!branchCheck) {
        return {
          success: false,
          fileName: '',
          filePath: '',
          error: `Selected branch "${targetBranch}" does not exist in repository ${owner}/${repo}. Please select an existing branch.`,
        };
      }
    }

    PerformanceProfiler.mark('t7_branchVerified');

    const { submission, customSolutionName, overwriteSha, forceSaveAnyway } = request;
    const { problem, code, language, runtime, memory } = submission;

    // Reuse directory state from pre-modal scan if available to eliminate redundant GET request
    const dirState = request.cachedDirState || (await this.getProblemDirectoryState(problem.id, problem.slug));
    PerformanceProfiler.mark('t8_dirStateRetrieved');

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

    PerformanceProfiler.mark('t9_duplicateCheckDone');

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
      PerformanceProfiler.mark('t10_solutionUploadStart');
      const uploadLines = code ? code.split('\n').length : 0;
      const uploadHash = computeCodeHash(code);
      console.log(
        `[Leet-Vault Pipeline Diagnostics] GitHub upload content length: ${code.length}, GitHub upload line count: ${uploadLines}, source hash: ${uploadHash}`
      );
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
      PerformanceProfiler.mark('t11_solutionUploadDone');

      const githubFileUrl = `https://github.com/${owner}/${repo}/blob/${targetBranch}/${fullFilePath}`;

      // 6. Update Problem README if setting is enabled
      let solutionCount = dirState.files.filter((f) => f.name.toLowerCase() !== 'readme.md').length;
      if (!existingFile && !overwriteSha) {
        solutionCount += 1;
      }
      if (solutionCount < 1) solutionCount = 1;

      // 6. Update Problem & Root READMEs in parallel for maximum speed
      let problemReadmeUpdated: boolean | undefined = undefined;
      let rootReadmeUpdated: boolean | undefined = undefined;
      const readmeWarnings: string[] = [];

      const readmeTasks: Promise<void>[] = [];
      if (settings.generateProblemReadme) {
        readmeTasks.push(
          this.syncProblemReadme(
            token,
            owner,
            repo,
            targetBranch,
            dirState,
            request,
            fileName,
            solutionName,
            {
              includeRuntime: settings.includeRuntimeInReadme,
              includeMemory: settings.includeMemoryInReadme,
            }
          )
            .then(() => {
              problemReadmeUpdated = true;
            })
            .catch((err) => {
              problemReadmeUpdated = false;
              readmeWarnings.push(`Problem README update failed: ${(err as Error).message || err}`);
            })
        );
      }

      if (settings.updateRootReadme) {
        readmeTasks.push(
          this.syncRootReadme(
            token,
            owner,
            repo,
            targetBranch,
            problem,
            dirState.folderName,
            solutionCount
          )
            .then(() => {
              rootReadmeUpdated = true;
            })
            .catch((err) => {
              rootReadmeUpdated = false;
              readmeWarnings.push(`Root README update failed: ${(err as Error).message || err}`);
            })
        );
      }

      if (readmeTasks.length > 0) {
        await Promise.all(readmeTasks);
      }

      PerformanceProfiler.mark('t12_problemReadmeDone');
      PerformanceProfiler.mark('t13_rootReadmeDone');

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

      PerformanceProfiler.mark('t14_historySaved');

      return {
        success: true,
        fileName,
        filePath: fullFilePath,
        commitSha: commitRes.commit.sha,
        githubUrl: githubFileUrl,
        problemReadmeUpdated,
        rootReadmeUpdated,
        warning: readmeWarnings.length > 0 ? readmeWarnings.join('; ') : undefined,
      };
    } catch (err: unknown) {
      console.error('GitHub file upload error:', err);
      const errMsg = (err as Error).message || 'Failed to push solution to GitHub';

      // Security check: if permission error occurs on write, invalidate verification cache
      if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('permission')) {
        await StorageService.saveSettings({
          repoConfig: {
            ...settings.repoConfig,
            verified: false,
          },
        });
      }

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
        if (!options?.isRetry) {
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
        }

        return {
          success: false,
          fileName,
          filePath: fullFilePath,
          conflictType: 'GITHUB_ERROR',
          queuedForRetry: true,
          error: options?.isRetry
            ? `Retry failed: ${errMsg}`
            : `Temporary GitHub error: ${errMsg}. Solution has been safely saved to Pending Queue.`,
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
    currentSolutionName: string,
    options?: { includeRuntime?: boolean; includeMemory?: boolean }
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

      // Retrieve existing README content to preserve manual notes and SHA
      let currentSha = dirState.readmeSha;
      let existingContent: string | undefined = undefined;

      if (dirState.readmeExists || currentSha) {
        const curFile = await GitHubContentsService.getFileContent(
          token,
          owner,
          repo,
          readmePath,
          branch
        );
        if (curFile) {
          currentSha = curFile.sha;
          existingContent = curFile.content;
        }
      }

      const readmeMd = ReadmeGenerator.generateProblemReadme(
        request.submission.problem,
        existingSolutions,
        {
          includeRuntime: options?.includeRuntime,
          includeMemory: options?.includeMemory,
          existingContent,
        }
      );

      // Skip write if problem README content is completely unchanged
      if (existingContent && existingContent.trim() === readmeMd.trim()) {
        return;
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
      throw readmeErr;
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

      // Skip write if root README table content is unchanged
      if (newRootContent.trim() === existingContent.trim()) {
        return;
      }

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
      throw rootErr;
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

    const result = await this.syncSolution(item.request, { isRetry: true });
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

  /**
   * Automatically processes queued pending items with exponential backoff and max retry limit.
   * Can be triggered by background alarms or extension startup.
   */
  static async processPendingQueueAutoRetry(maxRetries: number = 5): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }> {
    const queue = await StorageService.getPendingQueue();
    if (queue.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    const updatedQueue = [...queue];

    for (let i = 0; i < updatedQueue.length; i++) {
      const item = updatedQueue[i];

      // Dead-letter check: max retries reached
      if (item.retryCount >= maxRetries) {
        skipped++;
        continue;
      }

      // Exponential backoff check: base delay 60s * 2^retryCount, capped at 1 hour
      const backoffDelayMs = Math.min(60 * 1000 * Math.pow(2, item.retryCount), 60 * 60 * 1000);
      const lastAttempt = item.lastAttemptAt || item.createdAt;
      const now = Date.now();

      if (now - lastAttempt < backoffDelayMs) {
        // Not ready yet according to backoff policy
        skipped++;
        continue;
      }

      processed++;
      try {
        const result = await this.syncSolution(item.request, { isRetry: true });
        if (result.success) {
          succeeded++;
          // Remove from persistent queue
          await StorageService.removePendingItem(item.id);
          // Remove from local list so it's not saved back
          updatedQueue.splice(i, 1);
          i--;
        } else {
          failed++;
          item.retryCount += 1;
          item.lastAttemptAt = Date.now();
          item.error = result.error || 'Retry failed';
        }
      } catch (err: unknown) {
        failed++;
        item.retryCount += 1;
        item.lastAttemptAt = Date.now();
        item.error = (err as Error).message || 'Retry failed';
      }
    }

    // Persist any updated queue states
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_QUEUE]: updatedQueue });
    }

    return { processed, succeeded, failed, skipped };
  }
}
