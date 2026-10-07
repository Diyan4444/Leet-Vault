import { SubmissionDetector } from '../leetcode/submission-detector';
import { LeetCodeSubmission, ProblemDirectoryState, SyncResult } from '../shared/types';
import { MESSAGES } from '../shared/constants';
import { SolutionModal } from './solution-modal';

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
    console.log('[LeetCode GitHub Sync] Accepted submission detected:', submission);

    // 1. Check directory state on GitHub via Service Worker
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
            console.warn('[LeetCode GitHub Sync] Failed to get dir state:', chrome.runtime.lastError);
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

    // 2. Render Save Solution Modal
    if (this.currentModal) {
      this.currentModal.destroy();
    }

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
