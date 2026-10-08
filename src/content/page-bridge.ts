/**
 * Leet-Vault Monaco Editor Page-World Bridge
 * Runs in the web page's MAIN execution world (world: "MAIN").
 * Directly accesses LeetCode's live Monaco Editor instance and text models.
 * Completely eliminates virtualized DOM scraping and truncated file uploads.
 */

import { MONACO_BRIDGE_CONSTANTS } from '../shared/constants';

// Prevent duplicate execution if both declarative and programmatic injections run
if ((window as any).__LEET_VAULT_PAGE_BRIDGE_INITIALIZED__) {
  // Already active in this page world
} else {
  (window as any).__LEET_VAULT_PAGE_BRIDGE_INITIALIZED__ = true;

  /**
   * Updates the shared hidden DOM bridge element for instant synchronous reads.
   */
  function updateSharedDomElement(code: string | null): void {
    if (typeof document === 'undefined') return;
    try {
      let bridgeEl = document.getElementById(MONACO_BRIDGE_CONSTANTS.SYNC_DOM_ID);
      if (!bridgeEl) {
        bridgeEl = document.createElement('div');
        bridgeEl.id = MONACO_BRIDGE_CONSTANTS.SYNC_DOM_ID;
        bridgeEl.style.display = 'none';
        bridgeEl.setAttribute('aria-hidden', 'true');
        (document.body || document.documentElement).appendChild(bridgeEl);
      }
      bridgeEl.textContent = code ?? '';
    } catch {
      // DOM bridge update failure is non-fatal
    }
  }

  /**
   * Extracts the full, pristine source code from the active LeetCode solution editor.
   * Traverses Monaco editors and models, explicitly distinguishing the solution editor
   * from testcase, console, or description inputs.
   */
  function getActiveMonacoSource(): string | null {
    const win = window as any;
    const monaco = win.monaco;
    if (!monaco || !monaco.editor) {
      return null;
    }

    // 1. Prioritize active Monaco Code Editor instance (monaco.editor.getEditors())
    if (typeof monaco.editor.getEditors === 'function') {
      try {
        const editors: any[] = monaco.editor.getEditors();
        if (Array.isArray(editors) && editors.length > 0) {
          // Attached editors in current document
          const attachedEditors = editors.filter((ed) => {
            try {
              const dom = ed.getDomNode();
              return dom && typeof document !== 'undefined' && document.body.contains(dom);
            } catch {
              return false;
            }
          });

          // Filter for editors belonging to the main solution code editor container
          const solutionEditors = attachedEditors.filter((ed) => {
            try {
              const dom: HTMLElement | null = ed.getDomNode();
              if (!dom) return false;

              // Exclude editors located in testcase, console, or debug panels
              const isExcluded = !!dom.closest(
                '[class*="console"], [class*="testcase"], [id*="testcase"], [data-cy="testcase"], [class*="test-case"]'
              );
              if (isExcluded) return false;

              // Explicitly match LeetCode code editor container selectors
              const isSolutionContainer = !!dom.closest(
                '[data-track-load="code_editor"], [data-cy="code-editor"], #editor, .editor-container, [class*="editor-wrapper"], [class*="code-editor"], [class*="coding-area"], [class*="playground-editor"]'
              );
              if (isSolutionContainer) return true;

              // Geometric check: the main solution code editor has significant height and width
              const rect = dom.getBoundingClientRect();
              return rect.height > 100 && rect.width > 120;
            } catch {
              return false;
            }
          });

          const candidates = solutionEditors.length > 0 ? solutionEditors : attachedEditors;

          // Prefer editor with active text/widget focus (user was typing in it or clicked Submit)
          const focusedEditor = candidates.find((ed) => {
            try {
              return (
                (typeof ed.hasTextFocus === 'function' && ed.hasTextFocus()) ||
                (typeof ed.hasWidgetFocus === 'function' && ed.hasWidgetFocus())
              );
            } catch {
              return false;
            }
          });

          const chosenEditor = focusedEditor || candidates[0];
          if (chosenEditor) {
            const model = chosenEditor.getModel();
            if (model && typeof model.getValue === 'function') {
              const val = model.getValue();
              if (typeof val === 'string' && val.length > 0) {
                return val;
              }
            }
          }
        }
      } catch {
        // Fall through to getModels()
      }
    }

    // 2. Query Monaco Text Models (monaco.editor.getModels())
    if (typeof monaco.editor.getModels === 'function') {
      try {
        const models: any[] = monaco.editor.getModels();
        if (Array.isArray(models) && models.length > 0) {
          // Exclude testcase, console, input, and output models
          const nonTestModels = models.filter((m) => {
            try {
              const uri = m.uri ? m.uri.toString().toLowerCase() : '';
              if (
                uri.includes('input') ||
                uri.includes('output') ||
                uri.includes('testcase') ||
                uri.includes('console')
              ) {
                return false;
              }
              const lang = typeof m.getLanguageId === 'function' ? m.getLanguageId() : '';
              if (lang === 'plaintext') {
                return false;
              }
              return true;
            } catch {
              return true;
            }
          });

          const pool = nonTestModels.length > 0 ? nonTestModels : models;

          // Rank models based on LeetCode solution structural features
          let bestModel: any = null;
          let bestScore = -1;

          for (const m of pool) {
            try {
              const val = m.getValue();
              if (typeof val !== 'string' || val.length === 0) continue;

              let score = 0;
              if (val.includes('class Solution')) score += 100;
              if (val.includes('public:') || val.includes('def ') || val.includes('function') || val.includes('#include')) {
                score += 50;
              }
              if (val.includes('return ')) score += 10;
              score += Math.min(val.split('\n').length, 50);

              if (score > bestScore) {
                bestScore = score;
                bestModel = m;
              }
            } catch {
              // Ignore
            }
          }

          if (bestModel) {
            const val = bestModel.getValue();
            if (typeof val === 'string' && val.length > 0) {
              return val;
            }
          }

          // Fallback to any non-empty model
          for (const m of models) {
            try {
              const val = m.getValue();
              if (typeof val === 'string' && val.length > 0) {
                return val;
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Responds to extraction requests from the isolated content script.
   */
  function handleSourceRequest(requestId?: string): void {
    const code = getActiveMonacoSource();
    updateSharedDomElement(code);

    const payload = {
      source: code,
      length: code ? code.length : 0,
      lineCount: code ? code.split('\n').length : 0,
      requestId,
    };

    // 1. Dispatch custom DOM event
    try {
      document.dispatchEvent(
        new CustomEvent(MONACO_BRIDGE_CONSTANTS.RESPONSE_EVENT, { detail: payload })
      );
    } catch {
      // Ignore
    }

    // 2. Post window message
    try {
      window.postMessage(
        {
          channel: MONACO_BRIDGE_CONSTANTS.CHANNEL_PAGE_BRIDGE,
          type: MONACO_BRIDGE_CONSTANTS.RESPONSE_EVENT,
          ...payload,
        },
        '*'
      );
    } catch {
      // Ignore
    }
  }

  // Listen for CustomEvent requests
  document.addEventListener(MONACO_BRIDGE_CONSTANTS.REQUEST_EVENT, (e: any) => {
    handleSourceRequest(e.detail?.requestId);
  });

  // Listen for postMessage requests
  window.addEventListener('message', (event) => {
    if (
      event.data &&
      event.data.channel === MONACO_BRIDGE_CONSTANTS.CHANNEL_CONTENT_SCRIPT &&
      event.data.type === MONACO_BRIDGE_CONSTANTS.REQUEST_EVENT
    ) {
      handleSourceRequest(event.data.requestId);
    }
  });

  // Periodically synchronize shared DOM bridge to support instantaneous synchronous reads
  try {
    const syncInterval = setInterval(() => {
      const code = getActiveMonacoSource();
      if (code) {
        updateSharedDomElement(code);
      }
    }, 1500);

    // Initial sync
    setTimeout(() => {
      const code = getActiveMonacoSource();
      if (code) {
        updateSharedDomElement(code);
      }
    }, 500);
  } catch {
    // Ignore
  }

  console.log('[Leet-Vault] Page-world Monaco bridge initialized.');
}
