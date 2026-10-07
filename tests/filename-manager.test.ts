import { describe, it, expect } from 'vitest';
import { FilenameManager } from '../src/sync/filename-manager';
import { ExistingSolutionFile } from '../src/shared/types';

describe('FilenameManager & Solution Numbering', () => {
  it('correctly calculates the next default solution number', () => {
    // Exact scenario from specification:
    // Existing: heap-sort.cpp, merge-sort.cpp, quick-sort.cpp
    // Next unnamed solution -> solution-4.cpp
    const existingFiles: ExistingSolutionFile[] = [
      { name: 'heap-sort.cpp', path: '0912-sort-an-array/heap-sort.cpp', sha: '1', size: 100 },
      { name: 'merge-sort.cpp', path: '0912-sort-an-array/merge-sort.cpp', sha: '2', size: 100 },
      { name: 'quick-sort.cpp', path: '0912-sort-an-array/quick-sort.cpp', sha: '3', size: 100 },
    ];

    const nextNumber = FilenameManager.getNextDefaultSolutionNumber(existingFiles, 'cpp');
    expect(nextNumber).toBe(4);

    const resolved = FilenameManager.resolveTargetFilename('', existingFiles, 'cpp');
    expect(resolved.fileName).toBe('solution-4.cpp');
    expect(resolved.solutionName).toBe('Solution 4');
  });

  it('handles existing solution-5.cpp properly as in spec scenario #5', () => {
    const existingFiles: ExistingSolutionFile[] = [
      { name: 'heap-sort.cpp', path: '...', sha: '1', size: 100 },
      { name: 'merge-sort.cpp', path: '...', sha: '2', size: 100 },
      { name: 'quick-sort.cpp', path: '...', sha: '3', size: 100 },
      { name: 'bubble-sort.cpp', path: '...', sha: '4', size: 100 },
    ];

    const nextNumber = FilenameManager.getNextDefaultSolutionNumber(existingFiles, 'cpp');
    expect(nextNumber).toBe(5);

    const resolved = FilenameManager.resolveTargetFilename('', existingFiles, 'cpp');
    expect(resolved.fileName).toBe('solution-5.cpp');
    expect(resolved.solutionName).toBe('Solution 5');
  });

  it('detects conflicting filenames taking language into account', () => {
    const existingFiles: ExistingSolutionFile[] = [
      { name: 'heap-sort.cpp', path: '0912-sort-an-array/heap-sort.cpp', sha: '1', size: 100 },
      { name: 'heap-sort.py', path: '0912-sort-an-array/heap-sort.py', sha: '2', size: 100 },
    ];

    // Conflict for cpp
    const conflictCpp = FilenameManager.findConflictingFile('heap-sort.cpp', existingFiles);
    expect(conflictCpp).toBeDefined();
    expect(conflictCpp?.sha).toBe('1');

    // No conflict for java
    const conflictJava = FilenameManager.findConflictingFile('heap-sort.java', existingFiles);
    expect(conflictJava).toBeUndefined();
  });

  it('provides safe alternative filenames when duplicate names exist', () => {
    const existingFiles: ExistingSolutionFile[] = [
      { name: 'heap-sort.cpp', path: '0912-sort-an-array/heap-sort.cpp', sha: '1', size: 100 },
    ];

    const alt = FilenameManager.getAlternativeFilename('heap-sort.cpp', existingFiles);
    expect(alt).toBe('heap-sort-2.cpp');

    // With heap-sort-2.cpp already existing
    const existingWithAlt: ExistingSolutionFile[] = [
      ...existingFiles,
      { name: 'heap-sort-2.cpp', path: '...', sha: '2', size: 100 },
    ];
    const altNext = FilenameManager.getAlternativeFilename('heap-sort.cpp', existingWithAlt);
    expect(altNext).toBe('heap-sort-3.cpp');
  });
});
