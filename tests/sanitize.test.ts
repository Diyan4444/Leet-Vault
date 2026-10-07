import { describe, it, expect } from 'vitest';
import {
  sanitizeSolutionName,
  buildSolutionFilename,
  formatProblemFolderName,
  parseGitHubRepoUrl,
  sanitizeRootFolder,
} from '../src/utils/sanitize';

describe('Filename and Problem Sanitization', () => {
  it('sanitizes solution names correctly according to product rules', () => {
    expect(sanitizeSolutionName('Heap Sort')).toBe('heap-sort');
    expect(sanitizeSolutionName('Merge Sort')).toBe('merge-sort');
    expect(sanitizeSolutionName('Hash Map')).toBe('hash-map');
    expect(sanitizeSolutionName('DFS + Memoization')).toBe('dfs-memoization');
    expect(sanitizeSolutionName('   Bubble Sort   ')).toBe('bubble-sort');
    expect(sanitizeSolutionName('BFS & Queue')).toBe('bfs-queue');
  });

  it('prevents path traversal attacks and removes unsafe characters', () => {
    expect(sanitizeSolutionName('../../something')).toBe('something');
    expect(sanitizeSolutionName('..\\..\\malicious')).toBe('malicious');
    expect(sanitizeSolutionName('bad/name:with*symbols?')).toBe('bad-namewithsymbols');
    expect(sanitizeSolutionName('')).toBe('');
  });

  it('builds full solution filenames with correct language extensions', () => {
    expect(buildSolutionFilename('Heap Sort', 'cpp')).toBe('heap-sort.cpp');
    expect(buildSolutionFilename('Merge Sort', 'python3')).toBe('merge-sort.py');
    expect(buildSolutionFilename('Quick Sort', 'java')).toBe('quick-sort.java');
    expect(buildSolutionFilename('Bubble Sort', 'c++')).toBe('bubble-sort.cpp');
    expect(buildSolutionFilename('', 'cpp')).toBe('solution.cpp');
  });

  it('formats deterministic problem folder names with 4-digit zero-padding', () => {
    expect(formatProblemFolderName(912, 'sort-an-array')).toBe('0912-sort-an-array');
    expect(formatProblemFolderName('1', 'two-sum')).toBe('0001-two-sum');
    expect(formatProblemFolderName(2, 'add-two-numbers')).toBe('0002-add-two-numbers');
    expect(formatProblemFolderName(1500, 'design-a-leaderboard')).toBe('1500-design-a-leaderboard');
  });

  it('validates and parses GitHub repository URLs correctly', () => {
    expect(parseGitHubRepoUrl('https://github.com/Diyan4444/LeetCode')).toEqual({
      owner: 'Diyan4444',
      repo: 'LeetCode',
    });
    expect(parseGitHubRepoUrl('https://github.com/torvalds/linux.git')).toEqual({
      owner: 'torvalds',
      repo: 'linux',
    });
    expect(parseGitHubRepoUrl('Diyan4444/LeetCode')).toEqual({
      owner: 'Diyan4444',
      repo: 'LeetCode',
    });
    expect(parseGitHubRepoUrl('invalid-url-without-slash')).toBeNull();
    expect(parseGitHubRepoUrl('https://malicious.com/user/repo')).toBeNull();
  });

  it('validates and sanitizes rootFolder preventing path traversal', () => {
    expect(sanitizeRootFolder('leetcode')).toBe('leetcode');
    expect(sanitizeRootFolder('/leetcode/')).toBe('leetcode');
    expect(sanitizeRootFolder('src/solutions')).toBe('src/solutions');
    expect(sanitizeRootFolder('../../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRootFolder('..\\..\\malicious')).toBe('malicious');
    expect(sanitizeRootFolder('')).toBe('');
    expect(sanitizeRootFolder('/')).toBe('');
  });
});
