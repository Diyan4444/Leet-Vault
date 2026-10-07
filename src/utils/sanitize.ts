import { resolveLanguage } from '../leetcode/language-map';

/**
 * Sanitizes user-entered solution name into a GitHub-safe filename base.
 *
 * Rules:
 * 1. Trim whitespace
 * 2. Convert to lowercase
 * 3. Replace spaces and unsafe characters (+, &, _, etc.) with hyphens
 * 4. Remove unsafe filesystem characters (/ \ : * ? " < > | .)
 * 5. Strip path traversal attempts (../ or ./)
 * 6. Collapse repeated hyphens
 * 7. Remove leading and trailing hyphens
 * 8. Fallback to 'solution' if empty or all characters were stripped
 */
export function sanitizeSolutionName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Prevent path traversal sequences explicitly
  let clean = name.replace(/\.\.+/g, '').replace(/[/\\]/g, '-');

  // Replace + and & with meaningful connector or hyphen
  clean = clean.replace(/\+/g, '-').replace(/&/g, '-');

  // Lowercase
  clean = clean.toLowerCase();

  // Replace spaces and underscores with hyphens
  clean = clean.replace(/[\s_]+/g, '-');

  // Remove all characters except alphanumeric and hyphen
  clean = clean.replace(/[^a-z0-9-]/g, '');

  // Collapse consecutive hyphens
  clean = clean.replace(/-+/g, '-');

  // Trim leading and trailing hyphens
  clean = clean.replace(/^-+|-+$/g, '');

  return clean;
}

/**
 * Builds the full filename with extension.
 * e.g., sanitizeSolutionName("Heap Sort") + ".cpp" -> "heap-sort.cpp"
 */
export function buildSolutionFilename(solutionName: string, languageInput: string): string {
  const sanitized = sanitizeSolutionName(solutionName);
  const langConfig = resolveLanguage(languageInput);
  const baseName = sanitized || 'solution';
  return `${baseName}${langConfig.extension}`;
}

/**
 * Formats a LeetCode problem folder name deterministically.
 * Example:
 * Problem ID: 912, Title: "Sort an Array"
 * Returns: "0912-sort-an-array"
 *
 * Rules:
 * - 4-digit zero-padded problem number
 * - Slug in lowercase-kebab
 */
export function formatProblemFolderName(problemFrontendId: string | number, problemSlug: string): string {
  const numericId = parseInt(String(problemFrontendId).trim(), 10);
  const paddedId = isNaN(numericId)
    ? String(problemFrontendId).padStart(4, '0')
    : String(numericId).padStart(4, '0');

  const cleanSlug = problemSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${paddedId}-${cleanSlug}`;
}

/**
 * Parses and validates a GitHub repository URL or slug.
 * Supported formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - http://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 *
 * Returns { owner, repo } or null if invalid.
 */
export function parseGitHubRepoUrl(input: string): { owner: string; repo: string } | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  // Match standard GitHub repo URL or owner/repo format
  const pattern = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/)?$|^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/)?$/;
  const match = trimmed.match(pattern);

  if (!match) return null;

  const owner = match[1] || match[3];
  const repo = (match[2] || match[4]).replace(/\.git$/, '');

  // Disallow reserved names or path traversal
  if (!owner || !repo || owner === '..' || repo === '..' || owner === '.' || repo === '.') {
    return null;
  }

  return { owner, repo };
}

/**
 * Escapes unsafe HTML characters to prevent XSS.
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

