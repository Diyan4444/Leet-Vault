import { computeCodeHash, normalizeCodeForComparison } from '../utils/hashing';
import { ExistingSolutionFile } from '../shared/types';
import { GitHubContentsService } from '../github/contents';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchingFile?: ExistingSolutionFile;
  matchingFileName?: string;
}

export class DuplicateDetector {
  /**
   * Compares the submitted code with existing solutions in the problem directory.
   */
  static async checkDuplicateCode(
    newCode: string,
    existingFiles: ExistingSolutionFile[],
    token: string,
    owner: string,
    repo: string,
    branch: string
  ): Promise<DuplicateCheckResult> {
    const targetHash = computeCodeHash(newCode);
    const normalizedNewCode = normalizeCodeForComparison(newCode);

    // Only check code files (not README or markdown)
    const codeFiles = existingFiles.filter((f) => {
      const lower = f.name.toLowerCase();
      return !lower.startsWith('readme') && !lower.endsWith('.md');
    });

    for (const file of codeFiles) {
      try {
        const fileData = await GitHubContentsService.getFileContent(
          token,
          owner,
          repo,
          file.path,
          branch
        );

        if (fileData) {
          const existingHash = computeCodeHash(fileData.content);
          if (existingHash === targetHash) {
            // Double check by comparing normalized text directly
            if (normalizeCodeForComparison(fileData.content) === normalizedNewCode) {
              return {
                isDuplicate: true,
                matchingFile: file,
                matchingFileName: file.name,
              };
            }
          }
        }
      } catch (err) {
        // Log and continue checking other files
        console.warn(`Could not fetch file ${file.name} for duplicate comparison:`, err);
      }
    }

    return {
      isDuplicate: false,
    };
  }
}
