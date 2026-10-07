import { describe, it, expect } from 'vitest';
import { ReadmeGenerator, SolutionRowData } from '../src/sync/readme-generator';
import { LeetCodeProblem } from '../src/shared/types';

describe('ReadmeGenerator', () => {
  const problem: LeetCodeProblem = {
    id: '912',
    title: 'Sort an Array',
    slug: 'sort-an-array',
    url: 'https://leetcode.com/problems/sort-an-array/',
    difficulty: 'Medium',
    tags: ['Array', 'Divide and Conquer', 'Sorting'],
  };

  const solutions: SolutionRowData[] = [
    { number: 1, name: 'Heap Sort', filename: 'heap-sort.cpp', language: 'C++', runtime: '12 ms', memory: '20 MB' },
    { number: 2, name: 'Merge Sort', filename: 'merge-sort.cpp', language: 'C++', runtime: '8 ms', memory: '21 MB' },
    { number: 3, name: 'Quick Sort', filename: 'quick-sort.cpp', language: 'C++', runtime: '6 ms', memory: '20 MB' },
    { number: 4, name: 'Bubble Sort', filename: 'bubble-sort.cpp', language: 'C++', runtime: '450 ms', memory: '20 MB' },
    { number: 5, name: 'Solution 5', filename: 'solution-5.cpp', language: 'C++', runtime: '7 ms', memory: '20 MB' },
  ];

  it('generates a complete problem README with structured solutions table', () => {
    const md = ReadmeGenerator.generateProblemReadme(problem, solutions);

    expect(md).toContain('# 912. Sort an Array');
    expect(md).toContain('- **Difficulty:** Medium');
    expect(md).toContain('https://leetcode.com/problems/sort-an-array/');
    expect(md).toContain('| 1 | Heap Sort | [heap-sort.cpp](./heap-sort.cpp) | C++ | 12 ms | 20 MB |');
    expect(md).toContain('| 5 | Solution 5 | [solution-5.cpp](./solution-5.cpp) | C++ | 7 ms | 20 MB |');
  });

  it('safely updates designated section in root README without destroying manual content', () => {
    const manualPreamble = '# My Custom LeetCode Notes\n\nSome personal study guide notes that must not be deleted.\n\n';
    const initialContent = `${manualPreamble}<!-- LEETCODE-SYNC:START -->\nold table\n<!-- LEETCODE-SYNC:END -->\n\nFooter content.`;

    const problemList = [
      { id: '1', title: 'Two Sum', folder: '0001-two-sum', difficulty: 'Easy', count: 2 },
      { id: '912', title: 'Sort an Array', folder: '0912-sort-an-array', difficulty: 'Medium', count: 5 },
    ];

    const updated = ReadmeGenerator.updateRootReadmeContent(initialContent, problemList);

    expect(updated).toContain('# My Custom LeetCode Notes');
    expect(updated).toContain('Footer content.');
    expect(updated).toContain('| 1 | [Two Sum](./0001-two-sum) | Easy | 2 |');
    expect(updated).toContain('| 912 | [Sort an Array](./0912-sort-an-array) | Medium | 5 |');
    expect(updated).not.toContain('old table');
  });
});
