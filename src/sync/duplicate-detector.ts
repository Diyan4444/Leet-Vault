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

    if (codeFiles.length === 0) {
      return { isDuplicate: false };
    }

    const codeLen = normalizedNewCode.length;

    // Filter candidate files: if file.size is known and drastically different, it cannot be duplicate
    const candidateFiles = codeFiles.filter((file) => {
      if (file.size !== undefined && file.size > 0 && codeLen > 0) {
        if (file.size > codeLen * 8 || file.size < Math.floor(codeLen / 8)) {
          return false;
        }
      }
      return true;
    });

    if (candidateFiles.length === 0) {
      return { isDuplicate: false };
    }

    // Bounded concurrency (chunks of 5) with early exit on duplicate match
    const BATCH_SIZE = 5;
    for (let i = 0; i < candidateFiles.length; i += BATCH_SIZE) {
      const chunk = candidateFiles.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (file) => {
          try {
            const fileData = await GitHubContentsService.getFileContent(
              token,
              owner,
              repo,
              file.path,
              branch
            );
            return { file, fileData };
          } catch (err) {
            console.warn(`Could not fetch file ${file.name} for duplicate comparison:`, err);
            return { file, fileData: null };
          }
        })
      );

      for (const { file, fileData } of chunkResults) {
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
      }
    }

    return {
      isDuplicate: false,
    };
  }
}
