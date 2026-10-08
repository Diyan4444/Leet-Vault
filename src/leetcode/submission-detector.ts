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

export type SubmissionClassification =
  | 'PENDING'
  | 'JUDGING'
  | 'RUNNING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'COMPILE_ERROR'
  | 'COMPILATION_ERROR'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'UNKNOWN';

export const RESULT_CANDIDATE_SELECTORS = [
  'span[data-e2e-locator="submission-result"]',
  'div[data-e2e-locator="submission-result"]',
  'p[data-e2e-locator="submission-result"]',
  'div[data-cy="submission-result"]',
  'span[data-cy="submission-result"]',
  'div[data-cypress="submission-result"]',
  'span[data-cypress="submission-result"]',
  'div[class*="result-state"]',
  'span[class*="result-state"]',
  'span[class*="text-green"]',
  'div[class*="text-green"]',
  'span[class*="text-sd-green"]',
  'div[class*="text-sd-green"]',
  'span[class*="text-red"]',
  'div[class*="text-red"]',
  'span[class*="text-sd-red"]',
  'div[class*="text-sd-red"]',
].join(', ');

/**
 * Classifies raw DOM status text into a recognized submission status.
 */
export function classifySubmissionStatus(rawText: string): SubmissionClassification {
  const normalized = (rawText || '').trim().toLowerCase();

  if (normalized === 'accepted') return 'ACCEPTED';
  if (normalized === 'wrong answer') return 'WRONG_ANSWER';
  if (normalized === 'compile error') return 'COMPILE_ERROR';
  if (normalized === 'compilation error') return 'COMPILATION_ERROR';
  if (normalized === 'runtime error') return 'RUNTIME_ERROR';
  if (normalized === 'time limit exceeded') return 'TIME_LIMIT_EXCEEDED';
  if (normalized === 'memory limit exceeded') return 'MEMORY_LIMIT_EXCEEDED';
  if (normalized === 'output limit exceeded') return 'OUTPUT_LIMIT_EXCEEDED';
  if (normalized === 'pending') return 'PENDING';
  if (normalized === 'judging') return 'JUDGING';
  if (normalized.startsWith('running') || normalized === 'submitting') return 'RUNNING';

  return 'UNKNOWN';
}

export interface ActiveSubmissionAttempt {
  attemptId: string;
  problemId: string;
  problemSlug: string;
  language: string;
  sourceSnapshot: string;
  sourceHash: string;
  submittedAt: number;
  preExistingElements: Set<Element>;
  preExistingElementTexts: Map<Element, string>;
  initialResultSignatures: Set<string>;
  inProgressElements: Set<Element>;
  observedStatuses: Set<string>;
  state: SubmissionState;
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
      const safeSnapshot = (sourceSnapshot && sourceSnapshot.length > 0) ? sourceSnapshot : '';
      const snapshotLines = safeSnapshot ? safeSnapshot.split('\n').length : 0;
      const codeHash = computeCodeHash(safeSnapshot);
      console.log(
        `[Leet-Vault Pipeline Diagnostics] submission snapshot length: ${safeSnapshot.length}, submission snapshot line count: ${snapshotLines}, source hash: ${codeHash}`
      );

      const problem = LeetCodeProblemParser.extractProblemDetails();
      const language = LeetCodeParser.extractLanguage();
      const submittedAt = Date.now();
      const attemptId = `sub_${submittedAt}_${Math.random().toString(36).substring(2, 7)}`;

      // Snapshot any existing result badges and elements at T0 to ignore stale cards
      const { elements, texts, signatures } = this.captureExistingState();

      this.currentAttempt = {
        attemptId,
        problemId: problem?.id || '0000',
        problemSlug: problem?.slug || '',
        language,
        sourceSnapshot: safeSnapshot,
        sourceHash: codeHash,
        submittedAt,
        preExistingElements: elements,
        preExistingElementTexts: texts,
        initialResultSignatures: signatures,
        inProgressElements: new Set<Element>(),
        observedStatuses: new Set<string>(),
        state: SubmissionState.WAITING_FOR_RESULT,
      };

      console.log(`[Leet-Vault] Submission started: ${attemptId}`);
      console.log(`[Leet-Vault] Source snapshot captured: ${snapshotLines} lines`);

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

    const attempt = this.currentAttempt;
    const candidateNodes = Array.from(document.querySelectorAll(RESULT_CANDIDATE_SELECTORS));

    for (const node of candidateNodes) {
      // 1. Exclude historical submission list or table elements
      if (this.isHistoricalElement(node)) {
        continue;
      }

      const text = (node.textContent || '').trim();
      if (!text) continue;

      const classification = classifySubmissionStatus(text);
      if (classification === 'UNKNOWN') {
        continue;
      }

      // 2. In-progress states (Pending, Judging, Running)
      if (classification === 'PENDING' || classification === 'JUDGING' || classification === 'RUNNING') {
        attempt.inProgressElements.add(node);
        if (!attempt.observedStatuses.has(text)) {
          attempt.observedStatuses.add(text);
          console.log(`[Leet-Vault] Current result: ${text}`);
        }
        // State remains WAITING_FOR_RESULT; wait for terminal outcome
        continue;
      }

      // 3. Stale/Historical check for this candidate node
      const isPreExistingNode = attempt.preExistingElements.has(node);
      const initialText = attempt.preExistingElementTexts.get(node);
      const signature = this.getNodeSignature(node as HTMLElement);
      const isPreExistingSig = attempt.initialResultSignatures.has(signature);

      // Was this element already present at T0 with this exact terminal text?
      const wasUnchangedTerminalNodeFromT0 =
        (isPreExistingNode && initialText === text) ||
        (isPreExistingSig && isPreExistingNode && initialText === text);

      // If an element was already sitting with this terminal text before Submit,
      // it is historical UNLESS this specific element demonstrably transitioned
      // through an in-progress state during this attempt.
      if (wasUnchangedTerminalNodeFromT0 && !attempt.inProgressElements.has(node)) {
        if (classification === 'ACCEPTED') {
          console.log('[Leet-Vault] Ignoring historical Accepted result');
        }
        continue;
      }

      // 4. Terminal Non-Accepted states (Wrong Answer, Runtime Error, etc.)
      const isFailed =
        classification === 'WRONG_ANSWER' ||
        classification === 'COMPILE_ERROR' ||
        classification === 'COMPILATION_ERROR' ||
        classification === 'RUNTIME_ERROR' ||
        classification === 'TIME_LIMIT_EXCEEDED' ||
        classification === 'MEMORY_LIMIT_EXCEEDED' ||
        classification === 'OUTPUT_LIMIT_EXCEEDED';

      if (isFailed) {
        if (!attempt.observedStatuses.has(text)) {
          attempt.observedStatuses.add(text);
          console.log(`[Leet-Vault] Current result: ${text}`);
        }

        if (this.syncOnlyAccepted) {
          console.log('[Leet-Vault] Submission failed; popup suppressed');
          this.state = SubmissionState.FAILED;
          this.cleanupWaitingState();
          this.state = SubmissionState.IDLE;
          this.currentAttempt = null;
          return;
        }

        // If syncOnlyAccepted is explicitly set to false in settings
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

      // 5. Terminal Accepted state
      if (classification === 'ACCEPTED') {
        PerformanceProfiler.mark('t2_acceptedDetected');
        if (!attempt.observedStatuses.has('Accepted')) {
          attempt.observedStatuses.add('Accepted');
          console.log('[Leet-Vault] Current result: Accepted');
        }
        console.log('[Leet-Vault] Current submission accepted');
        console.log('[Leet-Vault] Opening save popup');

        const resultContainer = node.closest('div[class*="result"], div[class*="submission"], div.flex') || node.parentElement;

        this.state = SubmissionState.ACCEPTED;
        this.cleanupWaitingState();

        // Synthesize submission using the EXACT captured source snapshot from submit click
        const submission = LeetCodeParser.parseAcceptedSubmission(
          attempt.sourceSnapshot,
          resultContainer
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
   * Determines if a DOM element is part of a historical table or submission list.
   */
  private isHistoricalElement(node: Element): boolean {
    let curr: Element | null = node;
    while (curr) {
      const className = (curr.className || '').toString();
      const tagName = (curr.tagName || '').toUpperCase();
      if (
        className.includes('status-column') ||
        className.includes('submission-list') ||
        className.includes('history') ||
        tagName === 'TABLE' ||
        tagName === 'TBODY' ||
        tagName === 'TR' ||
        tagName === 'TD' ||
        (typeof curr.getAttribute === 'function' && curr.getAttribute('data-cypress') === 'submission-history')
      ) {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
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
   * Captures references and signatures of all currently existing result elements at T0
   * to ensure older submissions are never identified as the new result.
   */
  private captureExistingState(): {
    elements: Set<Element>;
    texts: Map<Element, string>;
    signatures: Set<string>;
  } {
    const elements = new Set<Element>();
    const texts = new Map<Element, string>();
    const signatures = new Set<string>();

    if (typeof document === 'undefined') {
      return { elements, texts, signatures };
    }

    const existing = document.querySelectorAll(RESULT_CANDIDATE_SELECTORS);
    for (const el of Array.from(existing)) {
      elements.add(el);
      const text = (el.textContent || '').trim();
      texts.set(el, text);
      signatures.add(this.getNodeSignature(el as HTMLElement));
    }

    return { elements, texts, signatures };
  }

  private getNodeSignature(node: HTMLElement): string {
    const text = (node.textContent || '').trim();
    const className = (node.className || '').toString();
    const locator =
      (typeof node.getAttribute === 'function' &&
        (node.getAttribute('data-e2e-locator') ||
          node.getAttribute('data-cy') ||
          node.getAttribute('data-cypress'))) ||
      '';
    const tagName = (node.tagName || '').toUpperCase();
    return `${tagName}_${locator}_${className}_${text}`;
  }
}
