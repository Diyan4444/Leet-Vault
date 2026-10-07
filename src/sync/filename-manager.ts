import { ExistingSolutionFile } from '../shared/types';
import { resolveLanguage } from '../leetcode/language-map';

export class FilenameManager {
  /**
   * Determines the next available default solution number for the problem.
   * Scans existing solution files in the problem directory and checks:
   * 1. Files explicitly matching pattern solution-(\d+)\.<ext>
   * 2. The total count of existing code files (excluding README.md, notes, etc.)
   *
   * Example:
   * Existing:
   *   heap-sort.cpp
   *   merge-sort.cpp
   *   quick-sort.cpp
   * Next unnamed solution number -> 4
   *
   * If there are solution-1.cpp and solution-4.cpp, it finds max(count+1, maxNumbered+1).
   */
  static getNextDefaultSolutionNumber(existingFiles: ExistingSolutionFile[], languageInput: string): number {
    const targetExt = resolveLanguage(languageInput).extension;
    
    // Filter files that are solutions (ignore README, notes, hidden files)
    const solutionFiles = existingFiles.filter((f) => {
      const lower = f.name.toLowerCase();
      return (
        !lower.startsWith('readme') &&
        !lower.startsWith('.') &&
        !lower.endsWith('.md') &&
        !lower.endsWith('.txt')
      );
    });

    let maxNumber = 0;
    const numberRegex = /^solution-(\d+)\./i;

    for (const file of solutionFiles) {
      const match = file.name.match(numberRegex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Default next number is either (total solution count + 1) or (highest numbered solution + 1),
    // whichever is greater to avoid collisions.
    const countBasedNumber = solutionFiles.length + 1;
    let nextNum = Math.max(countBasedNumber, maxNumber + 1);

    // Verify there isn't an existing file named `solution-{nextNum}.{targetExt}`
    const existingNames = new Set(existingFiles.map((f) => f.name.toLowerCase()));
    while (existingNames.has(`solution-${nextNum}${targetExt}`.toLowerCase())) {
      nextNum++;
    }

    return nextNum;
  }

  /**
   * Generates a safe filename for the solution.
   * If customName is provided, sanitizes it.
   * If empty, generates `solution-{N}.{ext}`.
   */
  static resolveTargetFilename(
    customName: string | undefined,
    existingFiles: ExistingSolutionFile[],
    languageInput: string
  ): { fileName: string; isDefaultNumbered: boolean; solutionName: string } {
    const langConfig = resolveLanguage(languageInput);
    const trimmed = (customName || '').trim();

    if (!trimmed) {
      const nextNumber = this.getNextDefaultSolutionNumber(existingFiles, languageInput);
      return {
        fileName: `solution-${nextNumber}${langConfig.extension}`,
        isDefaultNumbered: true,
        solutionName: `Solution ${nextNumber}`,
      };
    }

    // Sanitize user-provided name
    const sanitizedBase = trimmed
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    const baseName = sanitizedBase || 'solution';
    return {
      fileName: `${baseName}${langConfig.extension}`,
      isDefaultNumbered: false,
      solutionName: trimmed,
    };
  }

  /**
   * Checks if a filename already exists among existing files.
   * Considers language extension (e.g. heap-sort.cpp vs heap-sort.py).
   */
  static findConflictingFile(
    fileName: string,
    existingFiles: ExistingSolutionFile[]
  ): ExistingSolutionFile | undefined {
    const target = fileName.toLowerCase();
    return existingFiles.find((f) => f.name.toLowerCase() === target);
  }

  /**
   * Suggests the next alternative name when a filename collision occurs.
   * e.g. "heap-sort.cpp" -> "heap-sort-2.cpp"
   */
  static getAlternativeFilename(
    fileName: string,
    existingFiles: ExistingSolutionFile[]
  ): string {
    const dotIndex = fileName.lastIndexOf('.');
    const base = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
    const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : '';

    const existingNames = new Set(existingFiles.map((f) => f.name.toLowerCase()));
    let counter = 2;
    while (existingNames.has(`${base}-${counter}${ext}`.toLowerCase())) {
      counter++;
    }

    return `${base}-${counter}${ext}`;
  }
}
