import { LeetCodeParser } from './parser';
import { LeetCodeProblemParser } from './problem-parser';
import { LeetCodeSubmission } from '../shared/types';
import { computeCodeHash } from '../utils/hashing';
import { PerformanceProfiler } from '../utils/profiler';

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
  private keyListener: ((e: KeyboardEvent) => void) | null = null;
  private navigationChecker: any = null;
  private currentProblemSlug: string | null = null;
  private hasSeenJudging: boolean = false;
  private syncOnlyAccepted: boolean = true;

  constructor(onAccepted: SubmissionCallback, options?: { syncOnlyAccepted?: boolean }) {
    this.onAcceptedCallback = onAccepted;
    if (options?.syncOnlyAccepted !== undefined) {
      this.syncOnlyAccepted = options.syncOnlyAccepted;
    }
  }

  setSyncOnlyAccepted(val: boolean): void {
    this.syncOnlyAccepted = val;
  }

  getSyncOnlyAccepted(): boolean {
    return this.syncOnlyAccepted;
  }

  /**
   * Returns the current state of the submission detector state machine.
   */
  getState(): SubmissionState {
    return this.state;
  }

  /**
   * Starts event listeners for submit clicks, keyboard shortcuts, and SPA navigation.
   */
  start(): void {
    if (this.clickListener) return;

    this.currentProblemSlug = LeetCodeProblemParser.extractProblemSlug();

    // 1. Listen for user clicking the Submit button (various LeetCode DOM structures)
    this.clickListener = async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      const btn =
        target.closest('button') ||
        target.closest('[data-e2e-locator="console-submit-button"]') ||
        target.closest('[data-cy="submit-code-btn"]') ||
        target.closest('[data-cypress="submit-code-btn"]') ||
        target.closest('[role="button"]');
      if (!btn) return;

      const btnText = (btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const titleAttr = (btn.getAttribute('title') || '').toLowerCase();
      const dataLocator = btn.getAttribute('data-e2e-locator') || '';
      const dataCy = btn.getAttribute('data-cy') || '';
      const dataCypress = btn.getAttribute('data-cypress') || '';

      const isSubmitBtn =
        dataLocator === 'console-submit-button' ||
        dataCy === 'submit-code-btn' ||
        dataCypress === 'submit-code-btn' ||
        btnText.includes('submit') ||
        ariaLabel.includes('submit') ||
        titleAttr.includes('submit');

      if (!isSubmitBtn) return;

      await this.handleSubmitTrigger();
    };

    document.addEventListener('click', this.clickListener, true);

    // 2. Listen for keyboard submit shortcut (Ctrl+Enter or Cmd+Enter)
    this.keyListener = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        console.log('[LeetCode Sync] Keyboard shortcut (Ctrl/Cmd+Enter) submit detected.');
        await this.handleSubmitTrigger();
      }
    };

    document.addEventListener('keydown', this.keyListener, true);

    // 3. Track SPA navigation to reset state if problem changes
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

    if (this.keyListener) {
      document.removeEventListener('keydown', this.keyListener, true);
      this.keyListener = null;
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
   * Re-arms submission detection immediately when Submit is triggered,
   * ensuring repeated submissions are never ignored or dropped.
   */
  private async handleSubmitTrigger(): Promise<void> {
    if (this.state !== SubmissionState.IDLE) {
      this.cleanupWaitingState();
      this.state = SubmissionState.IDLE;
    }
    await this.handleSubmitClick();
  }

  /**
   * Called immediately when user clicks Submit.
   * Captures exact editor source snapshot before any DOM mutation or reset.
   */
  private async handleSubmitClick(): Promise<void> {
    PerformanceProfiler.mark('t0_submitClicked');
    this.state = SubmissionState.SUBMITTING;

    try {
      const sourceSnapshot = await LeetCodeParser.captureSourceSnapshot();
      PerformanceProfiler.mark('t1_sourceCaptured');
      const safeSnapshot = sourceSnapshot && sourceSnapshot.trim().length > 0 ? sourceSnapshot : '';

      const problem = LeetCodeProblemParser.extractProblemDetails();
      const language = LeetCodeParser.extractLanguage();
      const codeHash = computeCodeHash(safeSnapshot);
      const submittedAt = Date.now();

      // Snapshot any existing result badges on the page to ignore stale Accepted cards
      const initialResultSignatures = this.captureExistingResultSignatures();

      this.currentAttempt = {
        attemptId: `sub_${submittedAt}_${Math.random().toString(36).substring(2, 7)}`,
        problemId: problem?.id || '0000',
        problemSlug: problem?.slug || '',
        language,
        sourceSnapshot: safeSnapshot,
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
    this.hasSeenJudging = false;

    // 1. Responsive active polling loop (every 250ms, up to 25s)
    this.pollInterval = setInterval(() => {
      this.checkForCurrentSubmissionResult();
    }, 250);

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

    const timeSinceSubmit = Date.now() - this.currentAttempt.submittedAt;

    // Detect if LeetCode has transitioned through Judging / Pending state
    const pageText = document.body ? (document.body.textContent || '') : '';
    if (pageText.includes('Judging') || pageText.includes('Pending')) {
      this.hasSeenJudging = true;
    }

    // Selectors for submission result containers
    const candidateNodes = document.querySelectorAll(
      'span[data-e2e-locator="submission-result"], div[data-e2e-locator="submission-result"], div[data-cy="submission-result"], span[class*="text-green"], div[class*="text-green"], span[class*="text-sd-green"], div[class*="text-sd-green"], span[class*="text-red"], div[class*="text-red"], [class*="status-column"]'
    );

    for (const node of Array.from(candidateNodes)) {
      const text = (node.textContent || '').trim();
      if (!text) continue;

      if (text === 'Pending' || text === 'Judging') {
        this.hasSeenJudging = true;
        continue;
      }

      // Check if signature existed before submit click.
      // Pre-existing elements are only considered fresh if we observed an active
      // state transition through Pending/Judging. Stale results are never accepted purely by elapsed time!
      const signature = this.getNodeSignature(node as HTMLElement);
      const isPreExisting = this.currentAttempt.initialResultSignatures.has(signature);
      if (isPreExisting && !this.hasSeenJudging) {
        continue;
      }

      // 1. Check for Accepted result for THIS submission
      if (text === 'Accepted') {
        PerformanceProfiler.mark('t2_acceptedDetected');
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
        if (this.syncOnlyAccepted) {
          console.log(`[LeetCode Sync] Submission failed with status: ${text}. No popup shown.`);
          this.state = SubmissionState.FAILED;
          this.cleanupWaitingState();
          this.state = SubmissionState.IDLE;
          this.currentAttempt = null;
          return;
        }

        // If syncOnlyAccepted is false, allow capturing failed submission
        const attempt = this.currentAttempt;
        const resultContainer = node.closest('div[class*="result"], div[class*="submission"], div.flex') || node.parentElement;
        this.state = SubmissionState.FAILED;
        this.cleanupWaitingState();

        const submission = LeetCodeParser.parseAcceptedSubmission(
          attempt.sourceSnapshot,
          resultContainer,
          text as any
        );

        if (submission) {
          this.onAcceptedCallback(submission);
        }

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
