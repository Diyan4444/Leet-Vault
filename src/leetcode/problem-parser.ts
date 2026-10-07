import { LeetCodeProblem } from '../shared/types';

export class LeetCodeProblemParser {
  /**
   * Extracts problem slug and URL from current window location.
   * e.g., https://leetcode.com/problems/sort-an-array/description/ -> "sort-an-array"
   */
  static extractProblemSlug(): string | null {
    if (typeof window === 'undefined' || !window.location) {
      return 'sort-an-array'; // Safe test environment default
    }
    const pathname = window.location.pathname;
    const match = pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extracts problem frontend ID and Title from the page DOM or embedded Next.js state.
   * Centralized selectors support both new dynamic LeetCode layout and legacy layout.
   */
  static extractProblemDetails(): LeetCodeProblem | null {
    const slug = this.extractProblemSlug();
    if (!slug) return null;

    let id = '';
    let title = '';
    let difficulty: 'Easy' | 'Medium' | 'Hard' | undefined;

    // Strategy 0: Embedded Next.js state if present
    if (typeof document !== 'undefined') {
      try {
        const nextScript = document.getElementById('__NEXT_DATA__');
        if (nextScript && nextScript.textContent) {
          const nextData = JSON.parse(nextScript.textContent);
          const queries = nextData?.props?.pageProps?.dehydratedState?.queries;
          if (Array.isArray(queries)) {
            for (const q of queries) {
              const qData = q?.state?.data?.question;
              if (qData && qData.questionFrontendId && (!qData.titleSlug || qData.titleSlug === slug)) {
                id = String(qData.questionFrontendId);
                title = qData.title || title;
                if (qData.difficulty === 'Easy' || qData.difficulty === 'Medium' || qData.difficulty === 'Hard') {
                  difficulty = qData.difficulty;
                }
                break;
              }
            }
          }
        }
      } catch {
        // Safe fallback to DOM
      }
    }

    // Strategy 1: Title link containing problem title e.g. <a href="/problems/sort-an-array/">912. Sort an Array</a>
    if (typeof document !== 'undefined' && (!id || !title)) {
      const titleElements = [
        document.querySelector('div[data-cy="question-title"]'),
        document.querySelector('div.flex.items-start.gap-1 a'),
        document.querySelector('a[href*="/problems/' + slug + '"]'),
        document.querySelector('div[class*="text-title-"]'),
        document.querySelector('span[class*="text-lg"]'),
      ];

      for (const el of titleElements) {
        if (el && el.textContent) {
          const text = el.textContent.trim();
          const idTitleMatch = text.match(/^(\d+)\.\s*(.+)$/);
          if (idTitleMatch) {
            if (!id) id = idTitleMatch[1];
            if (!title) title = idTitleMatch[2].trim();
            break;
          } else if (!title && text.length > 2 && !text.includes('LeetCode')) {
            title = text;
          }
        }
      }
    }

    // Fallback if title wasn't cleanly extracted from headers
    if (!title) {
      title = slug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    // Strategy 2: Numeric ID search from page body/headings if still missing
    if (!id && typeof document !== 'undefined' && document.body) {
      const bodyText = (document.body as any).innerText || document.body.textContent || '';
      const matchSlug = bodyText.match(/#(\d+)/);
      if (matchSlug) {
        id = matchSlug[1];
      }
    }

    // Strategy 3: Difficulty extraction from badges
    if (!difficulty && typeof document !== 'undefined') {
      const diffEl = document.querySelector(
        'div[class*="text-difficulty-"], div[class*="text-olive"], div[class*="text-yellow"], div[class*="text-pink"], div[class*="text-brand-orange"]'
      );
      if (diffEl && diffEl.textContent) {
        const diffText = diffEl.textContent.trim().toLowerCase();
        if (diffText.includes('easy')) difficulty = 'Easy';
        else if (diffText.includes('medium')) difficulty = 'Medium';
        else if (diffText.includes('hard')) difficulty = 'Hard';
      }
    }

    return {
      id: id || '0000',
      title,
      slug,
      url: `https://leetcode.com/problems/${slug}/`,
      difficulty,
    };
  }
}
