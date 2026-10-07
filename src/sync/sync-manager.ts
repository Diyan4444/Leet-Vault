import {
  SyncRequest,
  SyncResult,
  ProblemDirectoryState,
  ExistingSolutionFile,
} from '../shared/types';
import { StorageService } from '../shared/storage';
import { GitHubContentsService } from '../github/contents';
import { FilenameManager } from './filename-manager';
import { DuplicateDetector } from './duplicate-detector';
import { ReadmeGenerator, SolutionRowData } from './readme-generator';
import { formatProblemFolderName } from '../utils/sanitize';
import { resolveLanguage } from '../leetcode/language-map';

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

      if (!contents) {
        return {
          folderName,
          folderPath,
          files: [],
          readmeExists: false,
        };
      }

      const items = Array.isArray(contents) ? contents : [contents];
      const files: ExistingSolutionFile[] = items
        .filter((item) => item.type === 'file')
        .map((item) => ({
          name: item.name,
          path: item.path,
          sha: item.sha,
          size: item.size,
          downloadUrl: item.download_url || undefined,
        }));

      const readmeFile = files.find((f) => f.name.toLowerCase() === 'readme.md');

      return {
        folderName,
        folderPath,
        files,
        readmeExists: !!readmeFile,
        readmeSha: readmeFile?.sha,
      };
    } catch (err) {
      console.warn('Failed to get problem directory state from GitHub:', err);
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
   * 7. Save to sync history
   */
  static async syncSolution(request: SyncRequest): Promise<SyncResult> {
    const settings = await StorageService.getSettings();
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
        branch
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
        branch,
        targetSha
      );

      const githubFileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${fullFilePath}`;

      // 6. Update Problem README if setting is enabled
      if (settings.generateProblemReadme) {
        await this.syncProblemReadme(
          token,
          owner,
          repo,
          branch,
          dirState,
          request,
          fileName,
          solutionName
        );
      }

      // 7. Record to Sync History
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
      // Re-fetch directory state or synthesize solutions table
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
}
