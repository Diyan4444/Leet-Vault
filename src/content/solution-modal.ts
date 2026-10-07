import {
  LeetCodeSubmission,
  ProblemDirectoryState,
  SyncResult,
} from '../shared/types';
import { resolveLanguage } from '../leetcode/language-map';
import { FilenameManager } from '../sync/filename-manager';

export interface ModalCallbacks {
  onSave: (customName: string, overwriteSha?: string, forceAnyway?: boolean) => Promise<SyncResult>;
  onClose: () => void;
}

export class SolutionModal {
  private container: HTMLElement | null = null;
  private submission: LeetCodeSubmission;
  private dirState: ProblemDirectoryState;
  private callbacks: ModalCallbacks;
  private pendingOverwriteSha?: string;
  private isSaving = false;
  private autoCloseTimer: any = null;

  constructor(
    submission: LeetCodeSubmission,
    dirState: ProblemDirectoryState,
    callbacks: ModalCallbacks
  ) {
    this.submission = submission;
    this.dirState = dirState;
    this.callbacks = callbacks;
  }

  render(): void {
    this.destroy();

    const langConfig = resolveLanguage(this.submission.language);
    const defaultNumber = FilenameManager.getNextDefaultSolutionNumber(
      this.dirState.files,
      this.submission.language
    );

    // Create Modal Overlay & Card
    const overlay = document.createElement('div');
    overlay.id = 'lc-gh-modal-overlay';
    overlay.setAttribute(
      'style',
      `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      box-sizing: border-box;
    `
    );

    const card = document.createElement('div');
    card.id = 'lc-gh-modal-card';
    card.setAttribute(
      'style',
      `
      background: #ffffff;
      width: 100%;
      max-width: 480px;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      border: 1px solid #e2e8f0;
      padding: 24px;
      box-sizing: border-box;
      position: relative;
      animation: lcModalFadeIn 0.2s ease-out;
    `
    );

    // Inject CSS Animation and Dark Mode support
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes lcModalFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      #lc-gh-modal-card input:focus {
        outline: none;
        border-color: #2563eb !important;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
      }
      .lc-btn {
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .lc-btn-primary {
        background: #2563eb;
        color: #ffffff;
        border: 1px solid #1d4ed8;
      }
      .lc-btn-primary:hover:not(:disabled) {
        background: #1d4ed8;
      }
      .lc-btn-secondary {
        background: #f8fafc;
        color: #475569;
        border: 1px solid #cbd5e1;
      }
      .lc-btn-secondary:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .lc-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
    overlay.appendChild(styleEl);

    // Build Content Structure
    const diffBadgeColor =
      this.submission.problem.difficulty === 'Easy'
        ? '#10b981'
        : this.submission.problem.difficulty === 'Hard'
        ? '#ef4444'
        : '#f59e0b';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #2563eb;">
            LeetCode → GitHub Sync
          </div>
          <h2 style="margin: 4px 0 2px 0; font-size: 18px; font-weight: 700; color: #0f172a;">
            ${this.submission.problem.title}
          </h2>
          <div style="display: flex; gap: 8px; align-items: center; font-size: 13px; color: #64748b;">
            <span>#${this.submission.problem.id}</span>
            <span>•</span>
            <span style="color: ${diffBadgeColor}; font-weight: 600;">${this.submission.problem.difficulty || 'LeetCode'}</span>
          </div>
        </div>
        <button id="lc-close-btn" style="background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; padding: 4px; line-height: 1;">&times;</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9;">
        <div>
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Language</span>
          <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-top: 2px;">
            ${langConfig.name} (${langConfig.extension})
          </div>
        </div>
        <div>
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Performance</span>
          <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-top: 2px;">
            ${this.submission.runtime || 'N/A'} · ${this.submission.memory || 'N/A'}
          </div>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label for="lc-sol-name-input" style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">
          Solution Name
        </label>
        <input
          id="lc-sol-name-input"
          type="text"
          placeholder="e.g. Heap Sort (Leave empty for Solution ${defaultNumber})"
          autocomplete="off"
          style="
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            box-sizing: border-box;
            background: #ffffff;
            color: #0f172a;
          "
        />
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <span id="lc-filename-preview" style="font-size: 12px; color: #64748b; font-family: monospace;">
            Preview: solution-${defaultNumber}${langConfig.extension}
          </span>
          <span style="font-size: 11px; color: #94a3b8;">Enter to save</span>
        </div>
      </div>

      <div id="lc-conflict-container" style="display: none; margin-bottom: 16px; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
        <div id="lc-conflict-message" style="font-size: 13px; color: #92400e; margin-bottom: 10px;"></div>
        <div id="lc-conflict-actions" style="display: flex; gap: 8px;"></div>
      </div>

      <div id="lc-status-container" style="display: none; margin-bottom: 16px; font-size: 13px;"></div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
        <button id="lc-cancel-btn" class="lc-btn lc-btn-secondary">Cancel</button>
        <button id="lc-save-btn" class="lc-btn lc-btn-primary">Save to GitHub</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.container = overlay;

    this.attachEventListeners(defaultNumber, langConfig.extension);
  }

  private attachEventListeners(defaultNumber: number, extension: string): void {
    if (!this.container) return;

    const input = this.container.querySelector('#lc-sol-name-input') as HTMLInputElement;
    const preview = this.container.querySelector('#lc-filename-preview') as HTMLElement;
    const saveBtn = this.container.querySelector('#lc-save-btn') as HTMLButtonElement;
    const cancelBtn = this.container.querySelector('#lc-cancel-btn') as HTMLButtonElement;
    const closeBtn = this.container.querySelector('#lc-close-btn') as HTMLButtonElement;

    // Focus automatically
    input.focus();

    // Filename live preview update
    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (!val) {
        preview.textContent = `Preview: solution-${defaultNumber}${extension}`;
      } else {
        const resolved = FilenameManager.resolveTargetFilename(val, this.dirState.files, this.submission.language);
        preview.textContent = `Preview: ${resolved.fileName}`;
      }
      this.hideConflict();
    });

    // Enter to submit
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    // Escape listener on window
    const escListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    window.addEventListener('keydown', escListener);

    saveBtn.addEventListener('click', () => this.handleSave());
    cancelBtn.addEventListener('click', () => this.close());
    closeBtn.addEventListener('click', () => this.close());

    // Click outside overlay to close
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  private async handleSave(forceAnyway = false): Promise<void> {
    if (this.isSaving || !this.container) return;

    const input = this.container.querySelector('#lc-sol-name-input') as HTMLInputElement;
    const saveBtn = this.container.querySelector('#lc-save-btn') as HTMLButtonElement;
    const solName = input.value.trim();

    this.isSaving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving to GitHub...';

    const result = await this.callbacks.onSave(solName, this.pendingOverwriteSha, forceAnyway);

    this.isSaving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save to GitHub';

    if (result.success) {
      this.showSuccess(result);
    } else if (result.conflictType === 'DUPLICATE_NAME') {
      this.showNameConflict(solName, result.fileName);
    } else if (result.conflictType === 'DUPLICATE_CODE') {
      this.showCodeConflict(result.fileName);
    } else {
      this.showError(result.error || 'Failed to save solution to GitHub.');
    }
  }

  private showNameConflict(userInput: string, fileName: string): void {
    const conflictBox = this.container?.querySelector('#lc-conflict-container') as HTMLElement;
    const conflictMsg = this.container?.querySelector('#lc-conflict-message') as HTMLElement;
    const conflictActions = this.container?.querySelector('#lc-conflict-actions') as HTMLElement;
    if (!conflictBox || !conflictMsg || !conflictActions) return;

    const existingFile = FilenameManager.findConflictingFile(fileName, this.dirState.files);
    this.pendingOverwriteSha = existingFile?.sha;

    const altName = FilenameManager.getAlternativeFilename(fileName, this.dirState.files);
    const altDisplayName = altName.replace(/\.[^/.]+$/, '').replace(/-/g, ' ');

    conflictMsg.innerHTML = `<strong>A solution named "${userInput || fileName}" already exists.</strong><br>Would you like to replace the existing file or save with an alternative name?`;
    conflictActions.innerHTML = `
      <button id="lc-replace-btn" class="lc-btn lc-btn-secondary" style="color: #b45309; border-color: #fde68a;">Replace Existing</button>
      <button id="lc-alt-btn" class="lc-btn lc-btn-primary">Save as ${altDisplayName}</button>
    `;

    conflictBox.style.display = 'block';

    const replaceBtn = conflictActions.querySelector('#lc-replace-btn') as HTMLButtonElement;
    const altBtn = conflictActions.querySelector('#lc-alt-btn') as HTMLButtonElement;

    replaceBtn.onclick = () => {
      this.handleSave(false);
    };

    altBtn.onclick = () => {
      const input = this.container?.querySelector('#lc-sol-name-input') as HTMLInputElement;
      if (input) {
        input.value = altDisplayName;
        this.pendingOverwriteSha = undefined;
        this.handleSave(false);
      }
    };
  }

  private showCodeConflict(existingFileName: string): void {
    const conflictBox = this.container?.querySelector('#lc-conflict-container') as HTMLElement;
    const conflictMsg = this.container?.querySelector('#lc-conflict-message') as HTMLElement;
    const conflictActions = this.container?.querySelector('#lc-conflict-actions') as HTMLElement;
    if (!conflictBox || !conflictMsg || !conflictActions) return;

    conflictMsg.innerHTML = `<strong>This identical code already exists on GitHub.</strong><br>Existing solution file: <code>${existingFileName}</code>`;
    conflictActions.innerHTML = `
      <button id="lc-save-anyway-btn" class="lc-btn lc-btn-primary">Save Anyway</button>
      <button id="lc-cancel-conflict-btn" class="lc-btn lc-btn-secondary">Cancel</button>
    `;

    conflictBox.style.display = 'block';

    const saveAnywayBtn = conflictActions.querySelector('#lc-save-anyway-btn') as HTMLButtonElement;
    const cancelConflictBtn = conflictActions.querySelector('#lc-cancel-conflict-btn') as HTMLButtonElement;

    saveAnywayBtn.onclick = () => {
      this.handleSave(true);
    };

    cancelConflictBtn.onclick = () => {
      this.hideConflict();
    };
  }

  private hideConflict(): void {
    const conflictBox = this.container?.querySelector('#lc-conflict-container') as HTMLElement;
    if (conflictBox) {
      conflictBox.style.display = 'none';
    }
  }

  private showSuccess(result: SyncResult): void {
    const card = this.container?.querySelector('#lc-modal-card') as HTMLElement;
    if (!card) return;

    // Clear any previous timer
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }

    card.innerHTML = `
      <div style="text-align: center; padding: 16px 0;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; background: #dcfce7; color: #15803d; border-radius: 50%; font-size: 22px; margin-bottom: 12px;">
          ✓
        </div>
        <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0;">
          Successfully pushed to GitHub
        </h3>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 12px 0 16px 0; text-align: left; font-size: 13px;">
          <div style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600;">File Path</div>
          <div style="font-family: monospace; color: #1e293b; word-break: break-all; margin-top: 2px;">
            ${result.filePath || result.fileName}
          </div>
        </div>
        <div style="display: flex; justify-content: center; gap: 10px; align-items: center;">
          ${
            result.githubUrl
              ? `<a href="${result.githubUrl}" target="_blank" rel="noreferrer" class="lc-btn lc-btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                  View on GitHub ↗
                 </a>`
              : ''
          }
          <button id="lc-done-btn" class="lc-btn lc-btn-secondary">Done</button>
        </div>
        <div id="lc-autoclose-hint" style="font-size: 11px; color: #94a3b8; margin-top: 12px;">
          Auto-closing in 5s...
        </div>
      </div>
    `;

    const doneBtn = card.querySelector('#lc-done-btn') as HTMLButtonElement;
    if (doneBtn) {
      doneBtn.onclick = () => {
        if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
        this.close();
      };
    }

    // 5-second auto-close countdown
    let remainingSeconds = 5;
    const hintEl = card.querySelector('#lc-autoclose-hint') as HTMLElement;
    const countdownInterval = setInterval(() => {
      remainingSeconds--;
      if (hintEl && remainingSeconds > 0) {
        hintEl.textContent = `Auto-closing in ${remainingSeconds}s...`;
      } else {
        clearInterval(countdownInterval);
      }
    }, 1000);

    this.autoCloseTimer = setTimeout(() => {
      clearInterval(countdownInterval);
      this.close();
    }, 5000);
  }

  private showError(msg: string): void {
    const statusBox = this.container?.querySelector('#lc-status-container') as HTMLElement;
    if (!statusBox) return;

    statusBox.style.display = 'block';
    statusBox.style.color = '#b91c1c';
    statusBox.style.background = '#fef2f2';
    statusBox.style.border = '1px solid #fecaca';
    statusBox.style.padding = '10px 12px';
    statusBox.style.borderRadius = '6px';
    statusBox.innerHTML = `<strong>Sync Failed:</strong> ${msg}`;
  }

  close(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    this.destroy();
    this.callbacks.onClose();
  }

  destroy(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}
