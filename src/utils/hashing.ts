/**
 * Normalizes code content for duplicate detection without altering original code intended for GitHub.
 *
 * Steps:
 * 1. Normalize all line breaks to \n
 * 2. Trim trailing whitespace on each line
 * 3. Normalize consecutive blank lines to single blank line
 * 4. Trim leading and trailing whitespace of the whole string
 */
export function normalizeCodeForComparison(code: string): string {
  if (!code) return '';
  // Strip UTF-8 Byte Order Mark (BOM) if present
  let clean = code.replace(/^\uFEFF/, '');

  // Normalize line endings (\r\n and \r to \n)
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split, trim trailing whitespace per line, collapse multiple blank lines, trim overall
  return clean
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Computes a fast, deterministic 32-bit FNV-1a hash of the string,
 * suitable for quick in-browser deduplication comparison without heavy crypto dependencies.
 */
export function computeCodeHash(code: string): string {
  const normalized = normalizeCodeForComparison(code);
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    // 32-bit FNV prime multiplication: hash * 16777619
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 8-character hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
