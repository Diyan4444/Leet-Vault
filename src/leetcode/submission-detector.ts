import { LeetCodeParser } from './parser';
import { LeetCodeSubmission } from '../shared/types';

export type SubmissionCallback = (submission: LeetCodeSubmission) => void;

export class SubmissionDetector {
  private observer: MutationObserver | null = null;
  private onAcceptedCallback: SubmissionCallback;
  private lastSubmissionTimestamp = 0;
  private isChecking = false;
  private capturedCodeAtSubmit: string | null = null;

  constructor(onAccepted: SubmissionCallback) {
    this.onAcceptedCallback = onAccepted;
  }

  /**
   * Starts observing page DOM mutations for submission status badges.
   */
  start(): void {
    if (this.observer) return;

    // Listen to submission button clicks as early signal and capture current editor source IMMEDIATELY
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const btn = target.closest('button');
      if (btn && btn.textContent?.includes('Submit')) {
        // Capture editor source code at exact submission moment before any DOM mutation or reset
        try {
          const currentCode = LeetCodeParser.extractCode();
          if (currentCode && currentCode.trim().length > 0) {
            this.capturedCodeAtSubmit = currentCode;
          }
        } catch (err) {
          console.warn('Could not snapshot code at submit click:', err);
        }
        this.scheduleCheckAfterSubmit();
      }
    });

    this.observer = new MutationObserver((mutations) => {
      // Look for result status badges appearing in DOM
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              const text = node.innerText || node.textContent || '';
              if (text.includes('Accepted') && !text.includes('Accepted Solutions')) {
                this.handlePotentialAccepted();
                return;
              }
            }
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private scheduleCheckAfterSubmit(): void {
    let attempts = 0;
    const maxAttempts = 30; // Check up to 15 seconds
    const interval = setInterval(() => {
      attempts++;
      const hasAccepted = this.checkForAcceptedBadge();
      if (hasAccepted) {
        clearInterval(interval);
        this.handlePotentialAccepted();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 500);
  }

  private checkForAcceptedBadge(): boolean {
    const successElements = document.querySelectorAll(
      'span[data-e2e-locator="submission-result"], div[class*="text-green"], span[class*="text-green"], div[data-cy="submission-result"]'
    );
    for (const el of Array.from(successElements)) {
      if (el.textContent?.trim() === 'Accepted') {
        return true;
      }
    }
    return false;
  }

  private handlePotentialAccepted(): void {
    const now = Date.now();
    // Debounce duplicate triggers within 3 seconds
    if (now - this.lastSubmissionTimestamp < 3000 || this.isChecking) {
      return;
    }
    this.isChecking = true;

    // Small delay for DOM metrics (runtime/memory) to finish rendering
    setTimeout(() => {
      try {
        const submission = LeetCodeParser.parseAcceptedSubmission(this.capturedCodeAtSubmit);
        if (submission && submission.status === 'Accepted') {
          this.lastSubmissionTimestamp = Date.now();
          this.capturedCodeAtSubmit = null; // Clear snapshot after handoff
          this.onAcceptedCallback(submission);
        }
      } catch (err) {
        console.error('Error parsing accepted submission:', err);
      } finally {
        this.isChecking = false;
      }
    }, 600);
  }
}
