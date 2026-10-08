import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LeetCodeParser } from '../src/leetcode/parser';
import { MONACO_BRIDGE_CONSTANTS } from '../src/shared/constants';
import { computeCodeHash } from '../src/utils/hashing';
import { GitHubContentsService } from '../src/github/contents';
import { SyncManager } from '../src/sync/sync-manager';
import { ProblemDirectoryState } from '../src/shared/types';

describe('Monaco Source Extraction & Full Source Preservation Suite', () => {
  const originalWindow = global.window;
  const originalDocument = global.document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  // Test 1: Long source test (50+ lines)
  it('1. Long source test: extracts all 50+ lines in exact order without omission', async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 60; i++) {
      lines.push(`// Line ${i}: int x_${i} = ${i * 10};`);
    }
    const longSource = lines.join('\n');

    // Mock Monaco editor and model on window
    const mockModel = {
      getValue: vi.fn(() => longSource),
      getLanguageId: () => 'cpp',
      uri: 'inmemory://model/1',
    };
    const mockEditor = {
      getDomNode: () => ({
        closest: (sel: string) => sel.includes('code_editor'),
        getBoundingClientRect: () => ({ height: 400, width: 600 }),
      }),
      getModel: () => mockModel,
      hasTextFocus: () => true,
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [mockEditor],
          getModels: () => [mockModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    (global as any).document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    expect(extracted).toBe(longSource);
    expect(extracted?.split('\n')).toHaveLength(60);
    expect(extracted?.split('\n')[0]).toBe('// Line 1: int x_1 = 10;');
    expect(extracted?.split('\n')[59]).toBe('// Line 60: int x_60 = 600;');
  });

  // Test 2: Virtualized DOM regression test
  it('2. Virtualized DOM regression test: does NOT return the 15-20 virtualized DOM lines; returns full 65 lines from model bridge', async () => {
    const fullLogicalLines: string[] = [];
    for (let i = 1; i <= 65; i++) {
      fullLogicalLines.push(`const val_${i} = ${i};`);
    }
    const fullLogicalSource = fullLogicalLines.join('\n');

    // Simulate virtualized DOM lines (e.g. only lines 20 to 35 are rendered in .view-line elements)
    const virtualizedDomLines = fullLogicalLines.slice(20, 35).map((text, idx) => ({
      textContent: text,
      style: { top: `${idx * 18}px` },
    }));

    const mockModel = {
      getValue: () => fullLogicalSource,
      getLanguageId: () => 'typescript',
      uri: 'inmemory://model/solution',
    };
    const mockEditor = {
      getDomNode: () => ({
        closest: (sel: string) => sel.includes('editor'),
        getBoundingClientRect: () => ({ height: 500, width: 800 }),
      }),
      getModel: () => mockModel,
      hasTextFocus: () => true,
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [mockEditor],
          getModels: () => [mockModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };

    (global as any).document = {
      getElementById: vi.fn((id: string) => {
        if (id === MONACO_BRIDGE_CONSTANTS.SYNC_DOM_ID) return null;
        return null;
      }),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn((sel: string) => {
        if (sel.includes('.view-line')) {
          // Virtualized DOM containing only 15 lines
          return virtualizedDomLines;
        }
        return [];
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    // Must NOT return the 15 virtualized lines (lines 20-35)
    expect(extracted).not.toBe(virtualizedDomLines.map((l) => l.textContent).join('\n'));
    // Must return the entire 65 logical lines from the Monaco model
    expect(extracted).toBe(fullLogicalSource);
    expect(extracted?.split('\n')).toHaveLength(65);
    expect(extracted?.split('\n')[0]).toBe('const val_1 = 1;');
    expect(extracted?.split('\n')[64]).toBe('const val_65 = 65;');
  });

  // Test 3: Blank-line preservation
  it('3. Blank-line preservation: retains every blank line and newline position exactly', async () => {
    const sourceWithBlankLines = `line 1\n\nline 3\n\n\nline 6\n`;

    const mockModel = {
      getValue: () => sourceWithBlankLines,
      getLanguageId: () => 'python',
      uri: 'inmemory://model/1',
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [{
            getDomNode: () => ({ closest: () => true, getBoundingClientRect: () => ({ height: 300, width: 400 }) }),
            getModel: () => mockModel,
          }],
          getModels: () => [mockModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    (global as any).document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    expect(extracted).toBe(sourceWithBlankLines);
    expect(extracted).toEqual(sourceWithBlankLines);

    // Verify newline structure
    const splitLines = extracted!.split('\n');
    expect(splitLines[0]).toBe('line 1');
    expect(splitLines[1]).toBe('');
    expect(splitLines[2]).toBe('line 3');
    expect(splitLines[3]).toBe('');
    expect(splitLines[4]).toBe('');
    expect(splitLines[5]).toBe('line 6');
    expect(splitLines[6]).toBe(''); // trailing newline
  });

  // Test 4: Whitespace preservation (indentation, tabs, spaces)
  it('4. Whitespace preservation: preserves indentation, tabs, and spaces inside the source', async () => {
    const whitespaceSource = `def solution():\n\t# tab indent\n    # 4 spaces indent\n        # 8 spaces indent\n\t    # mixed tab and space\n    return True\n`;

    const mockModel = {
      getValue: () => whitespaceSource,
      getLanguageId: () => 'python',
      uri: 'inmemory://model/python',
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [{
            getDomNode: () => ({ closest: () => true, getBoundingClientRect: () => ({ height: 200, width: 300 }) }),
            getModel: () => mockModel,
          }],
          getModels: () => [mockModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    (global as any).document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    expect(extracted).toBe(whitespaceSource);
    expect(extracted?.includes('\t# tab indent')).toBe(true);
    expect(extracted?.includes('    # 4 spaces indent')).toBe(true);
    expect(extracted?.includes('        # 8 spaces indent')).toBe(true);
    expect(extracted?.includes('\t    # mixed tab and space')).toBe(true);
  });

  // Test 5: Code before and after Solution test
  it('5. Code before and after Solution test: returns complete source with pragmas, includes, helpers, and trailing code', async () => {
    const fullCpp = `#pragma GCC optimize("O3")
#include <bits/stdc++.h>

using namespace std;

#define FAST ios::sync_with_stdio(false);

void helperBefore() {
}

class Solution {
public:
    int test() {
        return 1;
    }
};

void helperAfter() {
}
`;

    const mockModel = {
      getValue: () => fullCpp,
      getLanguageId: () => 'cpp',
      uri: 'inmemory://model/solution_cpp',
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [{
            getDomNode: () => ({ closest: () => true, getBoundingClientRect: () => ({ height: 400, width: 500 }) }),
            getModel: () => mockModel,
          }],
          getModels: () => [mockModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    (global as any).document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    expect(extracted).toBe(fullCpp);

    expect(extracted?.startsWith('#pragma GCC optimize("O3")')).toBe(true);
    expect(extracted?.includes('void helperBefore()')).toBe(true);
    expect(extracted?.includes('class Solution')).toBe(true);
    expect(extracted?.includes('void helperAfter()')).toBe(true);
  });

  // Test 6: Snapshot consistency test
  it('6. Snapshot consistency test: source captured at Submit == parseAcceptedSubmission == submission.code == GitHubContentsService.putFile', async () => {
    const originalCompleteSource = `// Pristine Solution\n#include <iostream>\n\nclass Solution {\npublic:\n    void solve() {}\n};\n\n// End of file\n`;

    // 1. Source captured at Submit
    const sourceSnapshot = originalCompleteSource;
    const snapshotHash = computeCodeHash(sourceSnapshot);

    // Mock problem parser details
    (global as any).window = {
      location: { pathname: '/problems/two-sum/' },
    };
    (global as any).document = {
      querySelector: vi.fn((sel: string) => {
        if (sel.includes('title')) return { textContent: '1. Two Sum' };
        return null;
      }),
      querySelectorAll: vi.fn(() => []),
    };

    // 2. Passed to parseAcceptedSubmission
    const submission = LeetCodeParser.parseAcceptedSubmission(sourceSnapshot);
    expect(submission).not.toBeNull();

    // Verify submission.code matches source captured at Submit
    expect(submission!.code).toBe(sourceSnapshot);
    expect(computeCodeHash(submission!.code)).toBe(snapshotHash);

    // Setup chrome storage mock for verified repo and user
    const mockStorageData = {
      lc_gh_settings: {
        githubToken: 'mock_token',
        repoConfig: {
          owner: 'test_owner',
          repo: 'test_repo',
          branch: 'main',
          rootFolder: '',
          verified: true,
          verifiedAt: Date.now(),
        },
        syncOnlyAccepted: true,
        duplicateDetection: false,
        generateProblemReadme: false,
        updateRootReadme: false,
      },
      lc_gh_user: {
        login: 'test_owner',
        id: 12345,
      },
    };

    (global as any).chrome = {
      storage: {
        local: {
          get: vi.fn((key: any, cb?: any) => {
            const data = typeof key === 'string'
              ? { [key]: (mockStorageData as any)[key] }
              : mockStorageData;
            if (cb) cb(data);
            return Promise.resolve(data);
          }),
          set: vi.fn((_data: any, cb?: any) => {
            if (cb) cb();
            return Promise.resolve();
          }),
        },
      },
    };


    // 3. Verify passed to GitHubContentsService.putFile
    let codeUploadedToGitHub = '';
    vi.spyOn(GitHubContentsService, 'putFile').mockImplementation(
      async (_token, _owner, _repo, _path, content, _msg, _branch, _sha) => {
        codeUploadedToGitHub = content;
        return {
          content: {
            name: 'two-sum.cpp',
            path: 'two-sum/two-sum.cpp',
            sha: 'mock_sha',
            size: content.length,
            html_url: '',
            url: '',
            download_url: '',
          },
          commit: { sha: 'commit_sha', message: 'Add solution', html_url: '' },
        };
      }
    );

    const mockDirState: ProblemDirectoryState = {
      folderName: '0001-two-sum',
      folderPath: '0001-two-sum',
      files: [],
      readmeExists: false,
    };

    // Sync through SyncManager
    const syncRes = await SyncManager.syncSolution({
      submission: submission!,
      customSolutionName: '',
      cachedDirState: mockDirState,
    });

    expect(syncRes.success).toBe(true);
    // Exact equality guarantee: source captured at Submit == code passed to GitHubContentsService.putFile
    expect(codeUploadedToGitHub).toBe(sourceSnapshot);
    expect(codeUploadedToGitHub.length).toBe(sourceSnapshot.length);
    expect(computeCodeHash(codeUploadedToGitHub)).toBe(snapshotHash);
  });

  // Test 7: Large solution test substantially larger than editor viewport
  it('7. Large solution test: solution with 200+ lines is preserved completely without viewport truncation', async () => {
    const largeLines: string[] = [];
    largeLines.push('#include <vector>');
    largeLines.push('class Solution {');
    largeLines.push('public:');
    for (let i = 1; i <= 200; i++) {
      largeLines.push(`    int step_${i}() { return ${i}; }`);
    }
    largeLines.push('};');
    const largeSource = largeLines.join('\n');

    const mockModel = {
      getValue: () => largeSource,
      getLanguageId: () => 'cpp',
      uri: 'inmemory://model/large',
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [{
            getDomNode: () => ({ closest: () => true, getBoundingClientRect: () => ({ height: 400, width: 600 }) }),
            getModel: () => mockModel,
            hasTextFocus: () => true,
          }],
          getModels: () => [mockModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    (global as any).document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    expect(extracted).toBe(largeSource);
    expect(extracted?.split('\n')).toHaveLength(204);
  });

  // Test 8: Active editor selection distinguishes solution editor from testcase console
  it('8. Distinguishes solution editor from testcase and console Monaco instances', async () => {
    const solutionCode = `class Solution { public: int maxSubArray() { return 42; } };`;
    const testcaseInput = `[-2,1,-3,4,-1,2,1,-5,4]`;

    const solutionModel = {
      getValue: () => solutionCode,
      getLanguageId: () => 'cpp',
      uri: 'inmemory://model/solution',
    };
    const testcaseModel = {
      getValue: () => testcaseInput,
      getLanguageId: () => 'plaintext',
      uri: 'inmemory://model/testcase_input',
    };

    // Editor 1 is in testcase panel
    const testcaseEditor = {
      getDomNode: () => ({
        closest: (sel: string) => sel.includes('testcase') || sel.includes('console'),
        getBoundingClientRect: () => ({ height: 60, width: 300 }),
      }),
      getModel: () => testcaseModel,
      hasTextFocus: () => false,
    };

    // Editor 2 is in main solution container
    const solutionEditor = {
      getDomNode: () => ({
        closest: (sel: string) => sel.includes('code_editor'),
        getBoundingClientRect: () => ({ height: 450, width: 700 }),
      }),
      getModel: () => solutionModel,
      hasTextFocus: () => true,
    };

    (global as any).window = {
      monaco: {
        editor: {
          getEditors: () => [testcaseEditor, solutionEditor],
          getModels: () => [testcaseModel, solutionModel],
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    (global as any).document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    const extracted = await LeetCodeParser.captureSourceSnapshot();
    expect(extracted).toBe(solutionCode);
    expect(extracted).not.toBe(testcaseInput);
  });
});
