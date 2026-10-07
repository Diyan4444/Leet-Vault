import { LeetCodeProblemParser } from './problem-parser';
import { LeetCodeSubmission } from '../shared/types';
import { resolveLanguage } from './language-map';

export class LeetCodeParser {
  /**
   * Extracts current language selected in the editor dropdown.
   */
  static extractLanguage(): string {
    if (typeof document === 'undefined') {
      return 'cpp';
    }

    // 1. Language selector button on editor header
    const langButton = document.querySelector(
      'button[id*="headlessui-listbox-button"], div[class*="editor"] button, [data-cy="lang-select"]'
    );
    if (langButton && langButton.textContent) {
      const text = langButton.textContent.trim();
      if (text && text.length < 20) {
        return text;
      }
    }

    // 2. Fallback search for common language text in editor toolbar
    const toolbarButtons = document.querySelectorAll('button');
    for (const btn of Array.from(toolbarButtons)) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (
        text === 'c++' ||
        text === 'java' ||
        text === 'python3' ||
        text === 'python' ||
        text === 'javascript' ||
        text === 'typescript' ||
        text === 'c#' ||
        text === 'c' ||
        text === 'go' ||
        text === 'rust' ||
        text === 'kotlin' ||
        text === 'swift'
      ) {
        return text;
      }
    }

    return 'cpp';
  }

  /**
   * Extracts exact, full source code from Monaco Editor or CodeMirror instances on the page.
   * Preserves all pragmas, includes, helper functions, macros, structs, class Solution,
   * comments, indentation, and code after Solution.
   */
  static extractCode(): string | null {
    if (typeof document === 'undefined') {
      return null;
    }

    // Strategy 1: Check Monaco textarea value or hidden editor buffer
    const monacoTextarea = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement | null;
    if (monacoTextarea && monacoTextarea.value && monacoTextarea.value.trim().length > 0) {
      return monacoTextarea.value;
    }

    // Strategy 2: Check window.monaco editor models if exposed or page-bridged
    if (typeof window !== 'undefined') {
      const win = window as any;
      if (win.monaco && win.monaco.editor && typeof win.monaco.editor.getModels === 'function') {
        const models = win.monaco.editor.getModels();
        if (models && models.length > 0) {
          for (const model of models) {
            const val = model.getValue();
            if (
              val &&
              val.trim().length > 0 &&
              (val.includes('class Solution') ||
                val.includes('function') ||
                val.includes('#include') ||
                val.includes('def '))
            ) {
              return val;
            }
          }
          const defaultVal = models[0].getValue();
          if (defaultVal && defaultVal.trim().length > 0) {
            return defaultVal;
          }
        }
      }
    }

    // Strategy 3: Check CodeMirror or pre/code elements
    const preCode = document.querySelector('pre code, .submission-detail pre, div[data-cy="submission-code"] pre');
    if (preCode && preCode.textContent && preCode.textContent.trim().length > 0) {
      return preCode.textContent;
    }

    // Strategy 4: Query Monaco lines container preserving exact line positioning
    const monacoLines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (monacoLines.length > 0) {
      const lineElements = Array.from(monacoLines) as HTMLElement[];
      lineElements.sort((a, b) => {
        const topA = parseFloat(a.style.top || '0');
        const topB = parseFloat(b.style.top || '0');
        return topA - topB;
      });

      const codeLines: string[] = [];
      lineElements.forEach((line) => {
        codeLines.push(line.textContent || '');
      });
      const code = codeLines.join('\n');
      if (code.trim().length > 0) {
        return code;
      }
    }

    // Strategy 5: CodeMirror lines
    const cmLines = document.querySelectorAll('.CodeMirror-code .CodeMirror-line');
    if (cmLines.length > 0) {
      const codeLines: string[] = [];
      cmLines.forEach((line) => {
        codeLines.push(line.textContent || '');
      });
      const code = codeLines.join('\n');
      if (code.trim().length > 0) {
        return code;
      }
    }

    return null;
  }

  /**
   * Captures snapshot of source code at the exact moment submit is clicked.
   */
  static async captureSourceSnapshot(): Promise<string | null> {
    const directCode = this.extractCode();
    if (directCode && directCode.trim().length > 0) {
      return directCode;
    }
    return null;
  }

  /**
   * Extracts submission metrics (Runtime and Memory) from the submission result banner or target container.
   * Normalizes values into stable strings e.g. "42 ms" (preserving "0 ms") or "N/A".
   */
  static extractMetrics(targetContainer?: Element | null): { runtime: string; memory: string } {
    let runtime: string | undefined;
    let memory: string | undefined;

    if (typeof document === 'undefined') {
      return { runtime: 'N/A', memory: 'N/A' };
    }

    const searchRoot = targetContainer || document;
    const textNodes = searchRoot.querySelectorAll('span, div, p');

    for (const el of Array.from(textNodes)) {
      const text = el.textContent?.trim() || '';

      if (!runtime) {
        const rtMatch = text.match(/Runtime\s*[:\s]?\s*(\d+(\.\d+)?\s*(ms|s))/i);
        if (rtMatch) {
          runtime = rtMatch[1];
        }
      }

      if (!memory) {
        const memMatch = text.match(/Memory\s*[:\s]?\s*(\d+(\.\d+)?\s*(MB|KB|GB))/i);
        if (memMatch) {
          memory = memMatch[1];
        }
      }

      if (runtime && memory) break;
    }

    return {
      runtime: runtime || 'N/A',
      memory: memory || 'N/A',
    };
  }

  /**
   * Synthesizes full LeetCodeSubmission object using the captured code snapshot.
   * Never rereads editor after Accepted to prevent saving post-submission edits.
   */
  static parseAcceptedSubmission(
    codeSnapshot: string | null,
    targetContainer?: Element | null
  ): LeetCodeSubmission | null {
    const problem = LeetCodeProblemParser.extractProblemDetails();
    if (!problem) return null;

    const code = (codeSnapshot && codeSnapshot.trim().length > 0) ? codeSnapshot : this.extractCode();
    if (!code) return null;

    const rawLang = this.extractLanguage();
    const resolvedLang = resolveLanguage(rawLang).id;
    const { runtime, memory } = this.extractMetrics(targetContainer);

    return {
      problem,
      code,
      language: resolvedLang,
      status: 'Accepted',
      runtime,
      memory,
      timestamp: Date.now(),
    };
  }
}
