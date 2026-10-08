import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubmissionDetector, SubmissionState } from '../src/leetcode/submission-detector';
import { LeetCodeSubmission } from '../src/shared/types';

// Simple lightweight mock DOM for Node test environment
class MockNode {
  public tagName: string;
  public className = '';
  public textContent = '';
  public attributes: Record<string, string> = {};
  public children: MockNode[] = [];
  public parentElement: MockNode | null = null;
  public parentNode: MockNode | null = null;
  public style: Record<string, string> = {};
  public value = '';
  private clickListeners: Array<(e: any) => void> = [];

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] || null;
  }

  setAttribute(name: string, val: string): void {
    this.attributes[name] = val;
  }

  appendChild(child: MockNode): void {
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
  }

  removeChild(child: MockNode): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      child.parentNode = null;
    }
  }

  addEventListener(event: string, cb: any): void {
    if (event === 'click') this.clickListeners.push(cb);
  }

  click(): void {
    const event = { target: this, preventDefault: () => {} };
    for (const listener of this.clickListeners) {
      listener(event);
    }
    // Bubble to document listeners
    if ((global as any).documentClickListeners) {
      for (const listener of (global as any).documentClickListeners) {
        listener(event);
      }
    }
  }

  closest(selector: string): MockNode | null {
    if (selector === 'button' && this.tagName === 'BUTTON') return this;
    if (selector.includes('result') && this.className.includes('result')) return this;
    if (this.parentElement) return this.parentElement.closest(selector);
    return null;
  }

  querySelectorAll(selector: string): MockNode[] {
    const matches: MockNode[] = [];
    const check = (node: MockNode) => {
      if (this.matchesSelector(node, selector)) {
        matches.push(node);
      }
      for (const child of node.children) {
        check(child);
      }
    };
    for (const child of this.children) {
      check(child);
    }
    return matches;
  }

  querySelector(selector: string): MockNode | null {
    const res = this.querySelectorAll(selector);
    return res.length > 0 ? res[0] : null;
  }

  private matchesSelector(node: MockNode, selector: string): boolean {
    const selectors = selector.split(',').map((s) => s.trim());
    return selectors.some((sel) => {
      if (sel.includes('data-e2e-locator="submission-result"')) {
        return node.getAttribute('data-e2e-locator') === 'submission-result';
      }
      if (sel.includes('data-e2e-locator="console-submit-button"')) {
        return node.getAttribute('data-e2e-locator') === 'console-submit-button';
      }
      if (sel.includes('textarea')) {
        return node.tagName === 'TEXTAREA';
      }
      if (sel.includes('span[class*="text-green"]')) {
        return node.tagName === 'SPAN' && node.className.includes('text-green');
      }
      if (sel.includes('div[class*="text-green"]')) {
        return node.tagName === 'DIV' && node.className.includes('text-green');
      }
      if (sel === 'span') return node.tagName === 'SPAN';
      if (sel === 'div') return node.tagName === 'DIV';
      if (sel === 'button') return node.tagName === 'BUTTON';
      return false;
    });
  }

  getBoundingClientRect() {
    return { top: 10, left: 20, width: 100, height: 40 };
  }
}

// Global DOM setup
const mockBody = new MockNode('BODY');
(global as any).documentClickListeners = [];
(global as any).document = {
  body: mockBody,
  createElement: (tag: string) => new MockNode(tag),
  addEventListener: (event: string, cb: any) => {
    if (event === 'click') (global as any).documentClickListeners.push(cb);
  },
  removeEventListener: (event: string, cb: any) => {
    if (event === 'click') {
      const idx = (global as any).documentClickListeners.indexOf(cb);
      if (idx !== -1) (global as any).documentClickListeners.splice(idx, 1);
    }
  },
  querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel),
  querySelector: (sel: string) => mockBody.querySelector(sel),
};

(global as any).window = {
  location: { pathname: '/problems/sort-an-array/' },
};

(global as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};

describe('SubmissionDetector State Machine & Submit Prerequisite', () => {
  let detector: SubmissionDetector;
  let acceptedCallback: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockBody.children = [];
    (global as any).documentClickListeners = [];
    acceptedCallback = vi.fn();
    detector = new SubmissionDetector(acceptedCallback);
  });

  afterEach(() => {
    if (detector) detector.stop();
  });

  it('starts in IDLE state', () => {
    expect(detector.getState()).toBe(SubmissionState.IDLE);
  });

  it('NEVER triggers modal when pre-existing Accepted text is present without a Submit click', () => {
    detector.start();

    // Simulate page having an "Accepted" badge from previous submissions
    const badge = (global as any).document.createElement('div');
    badge.className = 'text-green';
    badge.textContent = 'Accepted';
    mockBody.appendChild(badge);

    expect(detector.getState()).toBe(SubmissionState.IDLE);
    expect(acceptedCallback).not.toHaveBeenCalled();
  });

  it('ignores DOM mutations containing Accepted when no Submit was clicked', () => {
    detector.start();

    const historyItem = (global as any).document.createElement('div');
    historyItem.textContent = 'Accepted Solutions (42)';
    mockBody.appendChild(historyItem);

    expect(detector.getState()).toBe(SubmissionState.IDLE);
    expect(acceptedCallback).not.toHaveBeenCalled();
  });

  it('transitions IDLE -> SUBMITTING -> WAITING_FOR_RESULT on Submit click and captures code', async () => {
    const fullCode = `#pragma GCC optimize("O3")\n#include <vector>\nclass Solution {\npublic:\n    int test() { return 1; }\n};`;
    const editor = (global as any).document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = (global as any).document.createElement('textarea');
    textarea.value = fullCode;
    editor.appendChild(textarea);
    mockBody.appendChild(editor);

    const submitBtn = (global as any).document.createElement('button');
    submitBtn.setAttribute('data-e2e-locator', 'console-submit-button');
    submitBtn.textContent = 'Submit';
    mockBody.appendChild(submitBtn);

    detector.start();

    // Click submit
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(detector.getState()).toBe(SubmissionState.WAITING_FOR_RESULT);
    expect(acceptedCallback).not.toHaveBeenCalled();
  });

  it('transitions to FAILED and does NOT open modal on Wrong Answer', async () => {
    const editor = (global as any).document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = (global as any).document.createElement('textarea');
    textarea.value = 'class Solution {};';
    editor.appendChild(textarea);
    mockBody.appendChild(editor);

    const submitBtn = (global as any).document.createElement('button');
    submitBtn.textContent = 'Submit';
    mockBody.appendChild(submitBtn);

    detector.start();
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(detector.getState()).toBe(SubmissionState.WAITING_FOR_RESULT);

    // Simulate LeetCode rendering Wrong Answer
    const resultDiv = (global as any).document.createElement('div');
    resultDiv.setAttribute('data-e2e-locator', 'submission-result');
    resultDiv.textContent = 'Wrong Answer';
    mockBody.appendChild(resultDiv);

    (detector as any).checkForCurrentSubmissionResult();

    expect(detector.getState()).toBe(SubmissionState.IDLE);
    expect(acceptedCallback).not.toHaveBeenCalled();
  });

  it('transitions to FAILED and does NOT open modal on Compile Error or Runtime Error', async () => {
    const editor = (global as any).document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = (global as any).document.createElement('textarea');
    textarea.value = 'invalid code syntax';
    editor.appendChild(textarea);
    mockBody.appendChild(editor);

    const submitBtn = (global as any).document.createElement('button');
    submitBtn.textContent = 'Submit';
    mockBody.appendChild(submitBtn);

    detector.start();
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate Compile Error
    const resultDiv = (global as any).document.createElement('div');
    resultDiv.setAttribute('data-e2e-locator', 'submission-result');
    resultDiv.textContent = 'Compile Error';
    mockBody.appendChild(resultDiv);

    (detector as any).checkForCurrentSubmissionResult();

    expect(detector.getState()).toBe(SubmissionState.IDLE);
    expect(acceptedCallback).not.toHaveBeenCalled();
  });

  it('triggers callback on failed submission when syncOnlyAccepted is configured to false', async () => {
    detector.setSyncOnlyAccepted(false);

    const editor = (global as any).document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = (global as any).document.createElement('textarea');
    textarea.value = 'class Solution { public: int test() { return 0; } };';
    editor.appendChild(textarea);
    mockBody.appendChild(editor);

    const submitBtn = (global as any).document.createElement('button');
    submitBtn.textContent = 'Submit';
    mockBody.appendChild(submitBtn);

    detector.start();
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate Wrong Answer
    const resultDiv = (global as any).document.createElement('div');
    resultDiv.setAttribute('data-e2e-locator', 'submission-result');
    resultDiv.textContent = 'Wrong Answer';
    mockBody.appendChild(resultDiv);

    (detector as any).checkForCurrentSubmissionResult();

    expect(detector.getState()).toBe(SubmissionState.IDLE);
    expect(acceptedCallback).toHaveBeenCalledTimes(1);
    expect(acceptedCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'Wrong Answer',
      })
    );
  });

  it('transitions to ACCEPTED and triggers callback with exact captured source on new Accepted result', async () => {
    const fullSource = `#pragma GCC optimize("O3")\n#include <iostream>\n\n// Helper before Solution\nvoid helper() {}\n\nclass Solution {\npublic:\n    vector<int> sortArray(vector<int>& nums) {\n        return nums;\n    }\n};\n\n// Code after Solution\nint test() { return 42; }`;

    const editor = (global as any).document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = (global as any).document.createElement('textarea');
    textarea.value = fullSource;
    editor.appendChild(textarea);
    mockBody.appendChild(editor);

    const submitBtn = (global as any).document.createElement('button');
    submitBtn.textContent = 'Submit';
    mockBody.appendChild(submitBtn);

    detector.start();
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(detector.getState()).toBe(SubmissionState.WAITING_FOR_RESULT);

    // Modify editor AFTER submit to simulate user typing next code
    textarea.value = '// Modified code that should NOT be pushed';

    // Simulate Accepted result arriving with metrics
    const resultCard = (global as any).document.createElement('div');
    resultCard.className = 'result-container';
    const badge = (global as any).document.createElement('span');
    badge.setAttribute('data-e2e-locator', 'submission-result');
    badge.textContent = 'Accepted';
    const runtimeSpan = (global as any).document.createElement('span');
    runtimeSpan.textContent = 'Runtime: 42 ms';
    const memorySpan = (global as any).document.createElement('span');
    memorySpan.textContent = 'Memory: 12.4 MB';

    resultCard.appendChild(badge);
    resultCard.appendChild(runtimeSpan);
    resultCard.appendChild(memorySpan);
    mockBody.appendChild(resultCard);

    (detector as any).checkForCurrentSubmissionResult();

    expect(acceptedCallback).toHaveBeenCalledTimes(1);
    const passedSubmission: LeetCodeSubmission = acceptedCallback.mock.calls[0][0];

    // Must be the EXACT code snapshot captured at submit click, not the modified editor code
    expect(passedSubmission.code).toBe(fullSource);
    expect(passedSubmission.code).toContain('#pragma GCC optimize("O3")');
    expect(passedSubmission.code).toContain('void helper() {}');
    expect(passedSubmission.code).toContain('int test() { return 42; }');
    expect(passedSubmission.code).not.toContain('Modified code');
    expect(passedSubmission.runtime).toBe('42 ms');
    expect(passedSubmission.memory).toBe('12.4 MB');
  });
});
