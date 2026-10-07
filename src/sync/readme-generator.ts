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

export class ReadmeGenerator {
  /**
   * Generates or updates the problem-specific README.md.
   * Preserves any manual notes written by the user if sections are separated,
   * while rendering the structured Solutions table.
   */
  static generateProblemReadme(
    problem: LeetCodeProblem,
    solutions: SolutionRowData[]
  ): string {
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

    solutions.forEach((sol, idx) => {
      const num = idx + 1;
      const solName = escapeMarkdownTableCell(sol.name || `Solution ${num}`);
      const fileLink = `[${escapeMarkdownTableCell(sol.filename)}](./${sol.filename})`;
      const lang = escapeMarkdownTableCell(sol.language || 'Unknown');
      const rt = escapeMarkdownTableCell(sol.runtime || '-');
      const mem = escapeMarkdownTableCell(sol.memory || '-');
      md += `| ${num} | ${solName} | ${fileLink} | ${lang} | ${rt} | ${mem} |\n`;
    });

    md += `\n<!-- Generated automatically by LeetCode → GitHub Multi-Solution Sync -->\n`;
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
