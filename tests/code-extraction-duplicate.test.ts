import { describe, it, expect } from 'vitest';
import { LeetCodeParser } from '../src/leetcode/parser';
import { normalizeCodeForComparison, computeCodeHash } from '../src/utils/hashing';

describe('Source Code Extraction & Completeness Preservation', () => {
  const fullCppSource = `#pragma GCC optimize("O3")
#include <bits/stdc++.h>
using namespace std;

#define FAST ios::sync_with_stdio(false);

class Solution {
public:
    vector<int> sortArray(vector<int>& nums) {
        return nums;
    }
};

void helper() {
    // helper logic after class
}`;

  it('preserves complete source code without line omission, reordering, or corruption', () => {
    // Test parsing with pre-captured code snapshot
    const submission = LeetCodeParser.parseAcceptedSubmission(fullCppSource);
    expect(submission).not.toBeNull();
    expect(submission?.code).toBe(fullCppSource);

    // Verify all critical sections exist in strict order
    const code = submission!.code;
    const pragmaIndex = code.indexOf('#pragma GCC optimize("O3")');
    const includeIndex = code.indexOf('#include <bits/stdc++.h>');
    const classIndex = code.indexOf('class Solution');
    const helperIndex = code.indexOf('void helper()');

    expect(pragmaIndex).toBeGreaterThanOrEqual(0);
    expect(includeIndex).toBeGreaterThan(pragmaIndex);
    expect(classIndex).toBeGreaterThan(includeIndex);
    expect(helperIndex).toBeGreaterThan(classIndex);
  });
});

describe('Duplicate Code Detection Independence from Filename', () => {
  const codeA = `#pragma GCC optimize("O3")
#include <iostream>
using namespace std;

class Solution {
public:
    int add(int a, int b) { return a + b; }
};`;

  const codeA_CRLF_WithTrailingSpaces = `#pragma GCC optimize("O3")\r
#include <iostream>   \r
using namespace std;\r
\r
class Solution {\r
public:\r
    int add(int a, int b) { return a + b; }  \r
};\r
`;

  const codeB = `#pragma GCC optimize("O3")
#include <iostream>
using namespace std;

class Solution {
public:
    int multiply(int a, int b) { return a * b; }
};`;

  it('triggers duplicate detection for identical code regardless of filename', () => {
    // Code A saved under heap-sort.cpp vs Code A saved under merge-sort.cpp or solution-2.cpp
    const hash1 = computeCodeHash(codeA);
    const hash2 = computeCodeHash(codeA_CRLF_WithTrailingSpaces);

    expect(hash1).toBe(hash2);
    expect(normalizeCodeForComparison(codeA)).toBe(normalizeCodeForComparison(codeA_CRLF_WithTrailingSpaces));
  });

  it('does NOT trigger duplicate detection for distinct algorithms', () => {
    const hashA = computeCodeHash(codeA);
    const hashB = computeCodeHash(codeB);

    expect(hashA).not.toBe(hashB);
    expect(normalizeCodeForComparison(codeA)).not.toBe(normalizeCodeForComparison(codeB));
  });
});
