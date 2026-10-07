import { describe, it, expect } from 'vitest';
import { resolveLanguage, SUPPORTED_LANGUAGES } from '../src/leetcode/language-map';
import { normalizeCodeForComparison, computeCodeHash } from '../src/utils/hashing';

describe('Language Resolution & Centralized Mapping', () => {
  it('correctly maps all required core languages to appropriate extensions', () => {
    expect(resolveLanguage('C++').extension).toBe('.cpp');
    expect(resolveLanguage('C').extension).toBe('.c');
    expect(resolveLanguage('Java').extension).toBe('.java');
    expect(resolveLanguage('Python').extension).toBe('.py');
    expect(resolveLanguage('Python3').extension).toBe('.py');
    expect(resolveLanguage('JavaScript').extension).toBe('.js');
    expect(resolveLanguage('TypeScript').extension).toBe('.ts');
    expect(resolveLanguage('C#').extension).toBe('.cs');
    expect(resolveLanguage('Go').extension).toBe('.go');
    expect(resolveLanguage('Rust').extension).toBe('.rs');
    expect(resolveLanguage('Kotlin').extension).toBe('.kt');
    expect(resolveLanguage('Swift').extension).toBe('.swift');
    expect(resolveLanguage('PHP').extension).toBe('.php');
    expect(resolveLanguage('Ruby').extension).toBe('.rb');
    expect(resolveLanguage('Scala').extension).toBe('.scala');
    expect(resolveLanguage('Dart').extension).toBe('.dart');
  });

  it('handles aliases case-insensitively', () => {
    expect(resolveLanguage('c++').id).toBe('cpp');
    expect(resolveLanguage('py3').id).toBe('python3');
    expect(resolveLanguage('golang').id).toBe('go');
  });
});

describe('Code Normalization & Duplicate Hashing', () => {
  it('normalizes whitespace and newlines deterministically without losing code semantics', () => {
    const code1 = 'class Solution {\r\npublic:\r\n    void sort() {  \r\n    }\r\n}';
    const code2 = 'class Solution {\npublic:\n    void sort() {\n    }\n}';

    expect(normalizeCodeForComparison(code1)).toBe(normalizeCodeForComparison(code2));
    expect(computeCodeHash(code1)).toBe(computeCodeHash(code2));
  });

  it('produces different hashes for distinct algorithms', () => {
    const heapSort = 'void heapSort(vector<int>& arr) { /* heap sort logic */ }';
    const mergeSort = 'void mergeSort(vector<int>& arr) { /* merge sort logic */ }';

    expect(computeCodeHash(heapSort)).not.toBe(computeCodeHash(mergeSort));
  });
});
