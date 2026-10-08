import { LeetCodeProblem, ExistingSolutionFile } from '../shared/types';
import { resolveLanguage } from '../leetcode/language-map';

export interface SolutionRowData {
  number: number;
  name: string;
  filename: string;
  language: string;
  runtime?: string;
  memory?: string;
}

function escapeMarkdownTableCell(value: string): string {
  if (!value) return '';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

<<<<<<< HEAD
export interface ProblemReadmeOptions {
  includeRuntime?: boolean;
  includeMemory?: boolean;
  existingContent?: string;
}

export const PROBLEM_SOLUTIONS_START = '<!-- LEETCODE-SOLUTIONS:START -->';
export const PROBLEM_SOLUTIONS_END = '<!-- LEETCODE-SOLUTIONS:END -->';

=======
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
export class ReadmeGenerator {
  /**
   * Generates or updates the problem-specific README.md.
   * Preserves any manual notes written by the user outside the solutions table,
   * while rendering the structured Solutions table with configurable columns.
   */
  static generateProblemReadme(
    problem: LeetCodeProblem,
    solutions: SolutionRowData[],
    options?: ProblemReadmeOptions
  ): string {
<<<<<<< HEAD
    const includeRuntime = options?.includeRuntime ?? true;
    const includeMemory = options?.includeMemory ?? true;
    const existingContent = options?.existingContent;

    const headers = ['#', 'Solution', 'File', 'Language'];
    if (includeRuntime) headers.push('Runtime');
    if (includeMemory) headers.push('Memory');

    const dividers = headers.map(() => '---');

    let solutionsTable = `## Solutions\n\n`;
    solutionsTable += `| ${headers.join(' | ')} |\n`;
    solutionsTable += `| ${dividers.join(' | ')} |\n`;
=======
    const diffBadge = problem.difficulty
      ? `- **Difficulty:** ${escapeMarkdownTableCell(problem.difficulty)}\n`
      : '';
    const tagsLine = problem.tags && problem.tags.length > 0
      ? `- **Tags:** ${problem.tags.map((t) => `\`${escapeMarkdownTableCell(t)}\``).join(', ')}\n`
      : '';

    let md = `# ${problem.id ? `${escapeMarkdownTableCell(problem.id)}. ` : ''}${problem.title}\n\n`;
    md += diffBadge;
    md += `- **LeetCode Link:** [${escapeMarkdownTableCell(problem.title)}](${problem.url})\n`;
    md += tagsLine;
    md += `\n## Solutions\n\n`;
    md += `| # | Solution | File | Language | Runtime | Memory |\n`;
    md += `|---|---|---|---|---|---|\n`;
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463

    solutions.forEach((sol, idx) => {
      const num = idx + 1;
      const solName = escapeMarkdownTableCell(sol.name || `Solution ${num}`);
      const fileLink = `[${escapeMarkdownTableCell(sol.filename)}](./${sol.filename})`;
      const lang = escapeMarkdownTableCell(sol.language || 'Unknown');
<<<<<<< HEAD

      const row = [String(num), solName, fileLink, lang];
      if (includeRuntime) {
        row.push(escapeMarkdownTableCell(sol.runtime || '-'));
      }
      if (includeMemory) {
        row.push(escapeMarkdownTableCell(sol.memory || '-'));
      }
      solutionsTable += `| ${row.join(' | ')} |\n`;
=======
      const rt = escapeMarkdownTableCell(sol.runtime || '-');
      const mem = escapeMarkdownTableCell(sol.memory || '-');
      md += `| ${num} | ${solName} | ${fileLink} | ${lang} | ${rt} | ${mem} |\n`;
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
    });

    const markerBlock = `${PROBLEM_SOLUTIONS_START}\n${solutionsTable}\n${PROBLEM_SOLUTIONS_END}`;

    if (existingContent && existingContent.trim()) {
      // 1. If explicit solution markers exist in the document, replace only that section
      if (
        existingContent.includes(PROBLEM_SOLUTIONS_START) &&
        existingContent.includes(PROBLEM_SOLUTIONS_END)
      ) {
        const regex = new RegExp(`${PROBLEM_SOLUTIONS_START}[\\s\\S]*?${PROBLEM_SOLUTIONS_END}`, 'm');
        return existingContent.replace(regex, markerBlock);
      }

      // 2. If no markers exist but ## Solutions exists, preserve content before and after the table
      const solutionsHeaderRegex = /##\s*Solutions/i;
      const match = solutionsHeaderRegex.exec(existingContent);
      if (match) {
        const preamble = existingContent.slice(0, match.index).trimEnd();
        const afterSolutionsHeader = existingContent.slice(match.index);

        // Find end of old solutions table (scan past markdown table rows)
        const lines = afterSolutionsHeader.split('\n');
        let pastTableIndex = -1;
        let seenTable = false;

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            seenTable = true;
          } else if (seenTable && trimmed !== '') {
            pastTableIndex = i;
            break;
          }
        }

        let userNotes = '';
        if (pastTableIndex !== -1) {
          const remainingLines = lines.slice(pastTableIndex);
          userNotes = remainingLines.join('\n').replace(/<!-- Generated automatically by Leet-Vault -->/g, '').replace(/<!-- Generated automatically by Leet=Github -->/g, '').trim();
        }

        let result = preamble ? `${preamble}\n\n${markerBlock}` : markerBlock;
        if (userNotes) {
          result += `\n\n${userNotes}`;
        }
        result += `\n\n<!-- Generated automatically by Leet-Vault -->\n`;
        return result;
      }

      // 3. Fallback: preserve existing content as manual notes
      const cleaned = existingContent.replace(/<!-- Generated automatically by Leet-Vault -->/g, '').replace(/<!-- Generated automatically by Leet=Github -->/g, '').trim();
      return `${cleaned}\n\n${markerBlock}\n\n<!-- Generated automatically by Leet-Vault -->\n`;
    }

    // Fresh README generation
    const diffBadge = problem.difficulty
      ? `- **Difficulty:** ${escapeMarkdownTableCell(problem.difficulty)}\n`
      : '';
    const tagsLine = problem.tags && problem.tags.length > 0
      ? `- **Tags:** ${problem.tags.map((t) => `\`${escapeMarkdownTableCell(t)}\``).join(', ')}\n`
      : '';

    let md = `# ${problem.id ? `${escapeMarkdownTableCell(problem.id)}. ` : ''}${problem.title}\n\n`;
    md += diffBadge;
    md += `- **LeetCode Link:** [${escapeMarkdownTableCell(problem.title)}](${problem.url})\n`;
    md += tagsLine;
    md += `\n${markerBlock}\n\n<!-- Generated automatically by Leet-Vault -->\n`;
    return md;
  }

  /**
   * Updates root repository README.md by preserving existing contents
   * and updating the designated `<!-- LEETCODE-SYNC:START --> ... <!-- LEETCODE-SYNC:END -->` marker section.
   */
  static updateRootReadmeContent(
    currentContent: string,
    problemList: Array<{ id: string; title: string; folder: string; difficulty?: string; count: number }>
  ): string {
    const startTag = '<!-- LEETCODE-SYNC:START -->';
    const endTag = '<!-- LEETCODE-SYNC:END -->';

    const sorted = [...problemList].sort((a, b) => {
      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.id.localeCompare(b.id);
    });

    const totalSolutions = sorted.reduce((acc, p) => acc + p.count, 0);

    let tableSection = `${startTag}\n`;
    tableSection += `### Synced Problems Overview\n\n`;
    tableSection += `- **Problems Solved:** ${sorted.length}\n`;
    tableSection += `- **Total Solutions:** ${totalSolutions}\n\n`;
    tableSection += `| # | Problem | Difficulty | Solutions |\n`;
    tableSection += `|---|---|---|---|\n`;

    for (const p of sorted) {
      const link = `[${escapeMarkdownTableCell(p.title)}](./${p.folder})`;
      const diff = escapeMarkdownTableCell(p.difficulty || '-');
      tableSection += `| ${escapeMarkdownTableCell(p.id)} | ${link} | ${diff} | ${p.count} |\n`;
    }
    tableSection += `\n${endTag}`;

    if (currentContent.includes(startTag) && currentContent.includes(endTag)) {
      const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'm');
      return currentContent.replace(regex, tableSection);
    }

    // If marker tags not present, append to existing content
    if (currentContent.trim()) {
      return `${currentContent.trim()}\n\n${tableSection}\n`;
    }

    return `# LeetCode Solutions\n\n${tableSection}\n`;
  }
}
