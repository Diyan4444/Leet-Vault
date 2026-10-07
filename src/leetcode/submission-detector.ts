import { LeetCodeParser } from './parser';
import { LeetCodeProblemParser } from './problem-parser';
import { LeetCodeSubmission } from '../shared/types';
import { computeCodeHash } from '../utils/hashing';

export type SubmissionCallback = (submission: LeetCodeSubmission) => void;

export enum SubmissionState {
  IDLE = 'IDLE',
  SUBMITTING = 'SUBMITTING',
  WAITING_FOR_RESULT = 'WAITING_FOR_RESULT',
  ACCEPTED = 'ACCEPTED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
}

interface ActiveSubmissionAttempt {
  attemptId: string;
  problemId: string;
  problemSlug: string;
  language: string;
  sourceSnapshot: string;
  sourceHash: string;
  submittedAt: number;
  initialResultSignatures: Set<string>;
}

export class SubmissionDetector {
  private state: SubmissionState = SubmissionState.IDLE;
  private onAcceptedCallback: SubmissionCallback;
  private currentAttempt: ActiveSubmissionAttempt | null = null;

  private pollInterval: any = null;
  private timeoutTimer: any = null;
  private mutationObserver: MutationObserver | null = null;
  private clickListener: ((e: MouseEvent) => void) | null = null;
  private navigationChecker: any = null;
  private currentProblemSlug: string | null = null;

  constructor(onAccepted: SubmissionCallback) {
    this.onAcceptedCallback = onAccepted;
  }

  /**
   * Returns the current state of the submission detector state machine.
   */
  getState(): SubmissionState {
    return this.state;
  }

  /**
   * Starts event listeners for submit clicks and SPA navigation.
   * Does NOT start a permanent MutationObserver searching for 'Accepted'.
   */
  start(): void {
    if (this.clickListener) return;

    this.currentProblemSlug = LeetCodeProblemParser.extractProblemSlug();

    // 1. Listen for user clicking the Submit button
    this.clickListener = async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const btn = target.closest('button');
      if (!btn) return;

      const btnText = (btn.textContent || '').trim();
      const isSubmitBtn =
        btn.getAttribute('data-e2e-locator') === 'console-submit-button' ||
        btn.getAttribute('data-cy') === 'submit-code-btn' ||
        btnText.includes('Submit');

      if (!isSubmitBtn) return;

      // Only transition from IDLE state
      if (this.state !== SubmissionState.IDLE) {
        // If already submitting or waiting, don't re-trigger
        return;
      }

      await this.handleSubmitClick();
    };

    document.addEventListener('click', this.clickListener, true);

    // 2. Track SPA navigation to reset state if problem changes
    this.navigationChecker = setInterval(() => {
      const activeSlug = LeetCodeProblemParser.extractProblemSlug();
      if (activeSlug && this.currentProblemSlug && activeSlug !== this.currentProblemSlug) {
        this.currentProblemSlug = activeSlug;
        this.handleProblemNavigation();
      }
    }, 1000);
  }

  /**
   * Stops all observers, timers, and listeners.
   */
  stop(): void {
    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener, true);
      this.clickListener = null;
    }

    if (this.navigationChecker) {
      clearInterval(this.navigationChecker);
      this.navigationChecker = null;
    }

    this.cleanupWaitingState();
    this.state = SubmissionState.IDLE;
    this.currentAttempt = null;
  }

  /**
   * Called immediately when user clicks Submit.
   * Captures exact editor source snapshot before any DOM mutation or reset.
   */
  private async handleSubmitClick(): Promise<void> {
    this.state = SubmissionState.SUBMITTING;

    try {
      const sourceSnapshot = await LeetCodeParser.captureSourceSnapshot();
      if (!sourceSnapshot || sourceSnapshot.trim().length === 0) {
        console.warn('[LeetCode Sync] Empty source code captured; aborting submission tracking.');
        this.state = SubmissionState.IDLE;
        return;
      }

      const problem = LeetCodeProblemParser.extractProblemDetails();
      const language = LeetCodeParser.extractLanguage();
      const codeHash = computeCodeHash(sourceSnapshot);
      const submittedAt = Date.now();

      // Snapshot any existing result badges on the page to ignore stale Accepted cards
      const initialResultSignatures = this.captureExistingResultSignatures();

      this.currentAttempt = {
        attemptId: `sub_${submittedAt}_${Math.random().toString(36).substring(2, 7)}`,
        problemId: problem?.id || '0000',
        problemSlug: problem?.slug || '',
        language,
        sourceSnapshot,
        sourceHash: codeHash,
        submittedAt,
        initialResultSignatures,
      };

      this.state = SubmissionState.WAITING_FOR_RESULT;
      this.startWaitingForResult();
    } catch (err) {
      console.error('[LeetCode Sync] Error initializing submission attempt:', err);
      this.state = SubmissionState.IDLE;
      this.currentAttempt = null;
    }
  }

  /**
   * Starts active polling and targeted observation for this specific submission's result.
   */
  private startWaitingForResult(): void {
    this.cleanupWaitingState();

    // 1. Active polling loop (every 400ms, up to 25s)
    this.pollInterval = setInterval(() => {
      this.checkForCurrentSubmissionResult();
    }, 400);

    // 2. Targeted MutationObserver active ONLY while in WAITING_FOR_RESULT
    this.mutationObserver = new MutationObserver(() => {
      this.checkForCurrentSubmissionResult();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 3. Timeout timer (25 seconds)
    this.timeoutTimer = setTimeout(() => {
      if (this.state === SubmissionState.WAITING_FOR_RESULT) {
        console.log('[LeetCode Sync] Submission result timed out after 25s.');
        this.state = SubmissionState.TIMEOUT;
        this.cleanupWaitingState();
        this.state = SubmissionState.IDLE;
        this.currentAttempt = null;
      }
    }, 25000);
  }

  /**
   * Checks DOM for the result of THIS submission.
   */
  private checkForCurrentSubmissionResult(): void {
    if (this.state !== SubmissionState.WAITING_FOR_RESULT || !this.currentAttempt) {
      return;
    }

    // Verify user is still on the same problem
    const activeSlug = LeetCodeProblemParser.extractProblemSlug();
    if (activeSlug && this.currentAttempt.problemSlug && activeSlug !== this.currentAttempt.problemSlug) {
      this.handleProblemNavigation();
      return;
    }

    // Selectors for submission result containers
    const candidateNodes = document.querySelectorAll(
      'span[data-e2e-locator="submission-result"], div[data-e2e-locator="submission-result"], div[data-cy="submission-result"], span[class*="text-green"], div[class*="text-green"], span[class*="text-red"], div[class*="text-red"]'
    );

    for (const node of Array.from(candidateNodes)) {
      const text = (node.textContent || '').trim();
      if (!text) continue;

      // Skip elements that existed before this submission was clicked
      const signature = this.getNodeSignature(node as HTMLElement);
      if (this.currentAttempt.initialResultSignatures.has(signature)) {
        continue;
      }

      // 1. Check for Accepted result for THIS submission
      if (text === 'Accepted') {
        const attempt = this.currentAttempt;
        const resultContainer = node.closest('div[class*="result"], div[class*="submission"], div.flex') || node.parentElement;

        this.state = SubmissionState.ACCEPTED;
        this.cleanupWaitingState();

        // Synthesize submission using the EXACT captured source snapshot from submit click
        const submission = LeetCodeParser.parseAcceptedSubmission(
          attempt.sourceSnapshot,
          resultContainer
        );

        if (submission) {
          // Trigger modal only through the accepted state transition
          this.onAcceptedCallback(submission);
        }

        this.state = SubmissionState.IDLE;
        this.currentAttempt = null;
        return;
      }

      // 2. Check for Failed result (Wrong Answer, Runtime Error, Compile Error, TLE, etc.)
      const isFailed =
        text === 'Wrong Answer' ||
        text === 'Compile Error' ||
        text === 'Compilation Error' ||
        text === 'Runtime Error' ||
        text === 'Time Limit Exceeded' ||
        text === 'Memory Limit Exceeded' ||
        text === 'Output Limit Exceeded';

      if (isFailed) {
        console.log(`[LeetCode Sync] Submission failed with status: ${text}. No popup shown.`);
        this.state = SubmissionState.FAILED;
        this.cleanupWaitingState();
        this.state = SubmissionState.IDLE;
        this.currentAttempt = null;
        return;
      }
    }
  }

  /**
   * Resets submission tracking when user navigates to another problem.
   */
  private handleProblemNavigation(): void {
    if (this.state === SubmissionState.WAITING_FOR_RESULT) {
      console.log('[LeetCode Sync] Navigation detected; cancelling pending submission tracking.');
    }
    this.cleanupWaitingState();
    this.state = SubmissionState.IDLE;
    this.currentAttempt = null;
  }

  /**
   * Cleans up waiting pollers and observers.
   */
  private cleanupWaitingState(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * Captures signatures of all currently existing result badges on page
   * to ensure older submissions are not mistakenly identified as the new result.
   */
  private captureExistingResultSignatures(): Set<string> {
    const signatures = new Set<string>();
    const existing = document.querySelectorAll(
      'span[data-e2e-locator="submission-result"], div[data-e2e-locator="submission-result"], div[data-cy="submission-result"], span[class*="text-green"], div[class*="text-green"]'
    );
    for (const el of Array.from(existing)) {
      signatures.add(this.getNodeSignature(el as HTMLElement));
    }
    return signatures;
  }

  private getNodeSignature(node: HTMLElement): string {
    const text = (node.textContent || '').trim();
    const className = node.className || '';
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { top: 0, left: 0 };
    return `${text}_${className}_${Math.round(rect.top)}_${Math.round(rect.left)}`;
  }
}
