import { SubmissionDetector } from '../leetcode/submission-detector';
import { LeetCodeSubmission, ProblemDirectoryState, SyncResult, ExtensionSettings } from '../shared/types';
import { MESSAGES } from '../shared/constants';
import { SolutionModal } from './solution-modal';
import { FilenameManager } from '../sync/filename-manager';
import { PerformanceProfiler } from '../utils/profiler';
import { LeetCodeProblemParser } from '../leetcode/problem-parser';

class LeetCodeContentApp {
  private detector: SubmissionDetector;
  private currentModal: SolutionModal | null = null;

  constructor() {
    this.detector = new SubmissionDetector((submission) => this.handleAcceptedSubmission(submission));
  }

  init(): void {
    console.log('[LeetCode GitHub Sync] Content script active on LeetCode.');
    this.detector.start();

    // Listen to background messages if any
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === MESSAGES.SHOW_SAVE_POPUP && message.payload) {
        this.handleAcceptedSubmission(message.payload);
        sendResponse({ received: true });
      }
      return true;
    });
  }

  private async handleAcceptedSubmission(submission: LeetCodeSubmission): Promise<void> {
    console.log('[LeetCode GitHub Sync] Accepted submission detected for:', submission.problem.title);

    // 1. Authoritative check: Is GitHub connected and repository verified?
    const status = await new Promise<{
      isConnected: boolean;
      isRepoVerified: boolean;
      settings: ExtensionSettings;
    }>((resolve) => {
      chrome.runtime.sendMessage({ type: MESSAGES.GET_STATUS }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve({ isConnected: false, isRepoVerified: false, settings: {} as any });
        } else {
          resolve(response);
        }
      });
    });

    if (!status.isConnected || !status.isRepoVerified) {
      if (this.currentModal) this.currentModal.destroy();
      this.currentModal = new SolutionModal(submission, { folderName: '', folderPath: '', files: [], readmeExists: false }, {
        onSave: async () => ({ success: false, fileName: '', filePath: '' }),
        onClose: () => { this.currentModal = null; },
      });
      this.currentModal.renderConnectPrompt(() => {
        chrome.runtime.sendMessage({ type: MESSAGES.OPEN_OPTIONS_PAGE });
      });
      return;
    }

    // 2. Discover directory state on GitHub via Service Worker
    const dirState: ProblemDirectoryState = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: MESSAGES.GET_DIRECTORY_STATE,
          payload: {
            problemId: submission.problem.id,
            problemSlug: submission.problem.slug,
          },
        },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve({
              folderName: `${submission.problem.id}-${submission.problem.slug}`,
              folderPath: `${submission.problem.id}-${submission.problem.slug}`,
              files: [],
              readmeExists: false,
            });
          } else {
            resolve(response.state);
          }
        }
      );
    });

    // 3. Functional Auto-Sync check
    if (status.settings && status.settings.autoSync) {
      const defaultResolution = FilenameManager.resolveTargetFilename(
        '',
        dirState.files,
        submission.language
      );
      const existingFile = FilenameManager.findConflictingFile(defaultResolution.fileName, dirState.files);

      // Check duplicate code if setting enabled
      let isDuplicateCode = false;
      if (status.settings.duplicateDetection) {
        const dupCheck = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: MESSAGES.CHECK_DUPLICATE_CODE,
              payload: { code: submission.code, files: dirState.files },
            },
            (res) => resolve(res?.dupResult)
          );
        });
        isDuplicateCode = !!(dupCheck && dupCheck.isDuplicate);
      }

      // If no filename conflict and no duplicate code, auto-commit directly!
      if (!existingFile && !isDuplicateCode) {
        console.log('[LeetCode GitHub Sync] Auto-syncing solution with default name...');
        const syncResult = await new Promise<SyncResult>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: MESSAGES.SYNC_SOLUTION,
              payload: {
                submission,
                customSolutionName: '',
                cachedDirState: dirState,
              },
            },
            (res) => resolve(res?.result)
          );
        });

        if (this.currentModal) {
          this.currentModal.destroy();
          this.currentModal = null;
        }
        if (syncResult && syncResult.success) {
          SolutionModal.showToastNotification(syncResult.filePath || syncResult.fileName);
        }
        return;
      }
      // If a collision/duplicate exists, fall through to modal for user decision
    }

    // 4. Render Save Solution Modal for manual naming or conflict resolution
    if (this.currentModal) {
      this.currentModal.destroy();
    }

    PerformanceProfiler.mark('t3_modalOpened');
    this.currentModal = new SolutionModal(submission, dirState, {
      onSave: async (customName, overwriteSha, forceAnyway) => {
        return await new Promise<SyncResult>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: MESSAGES.SYNC_SOLUTION,
              payload: {
                submission,
                customSolutionName: customName,
                overwriteSha,
                forceSaveAnyway: forceAnyway,
                cachedDirState: dirState,
              },
            },
            (response) => {
              if (chrome.runtime.lastError || !response) {
                resolve({
                  success: false,
                  fileName: '',
                  filePath: '',
                  error: chrome.runtime.lastError?.message || 'Extension communication failed',
                });
              } else {
                resolve(response.result);
              }
            }
          );
        });
      },
      onClose: () => {
        this.currentModal = null;
      },
    });

    this.currentModal.render();
  }
}

// Start Content App
const app = new LeetCodeContentApp();
app.init();
