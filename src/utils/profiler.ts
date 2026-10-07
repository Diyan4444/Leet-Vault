/**
 * Performance Profiler & Diagnostic Instrumentation
 * Accurately measures latency across every phase of the LeetCode -> GitHub sync pipeline.
 */

export interface SyncPerformanceProfile {
  t0_submitClicked?: number;
  t1_sourceCaptured?: number;
  t2_acceptedDetected?: number;
  t3_modalOpened?: number;
  t4_saveConfirmed?: number;
  t5_authRetrieved?: number;
  t6_repoVerified?: number;
  t7_branchVerified?: number;
  t8_dirStateRetrieved?: number;
  t9_duplicateCheckDone?: number;
  t10_solutionUploadStart?: number;
  t11_solutionUploadDone?: number;
  t12_problemReadmeDone?: number;
  t13_rootReadmeDone?: number;
  t14_historySaved?: number;
  t15_successUiDone?: number;

  // Calculated stage durations (in milliseconds)
  sourceExtractionTime?: number;
  submissionDetectionTime?: number;
  repoValidationTime?: number;
  branchValidationTime?: number;
  gitHubReadTime?: number;
  duplicateDetectionTime?: number;
  solutionUploadTime?: number;
  problemReadmeTime?: number;
  rootReadmeTime?: number;
  localStorageTime?: number;
  totalSyncTime?: number;
}

export class PerformanceProfiler {
  private static marks: Map<string, number> = new Map();
  private static latestProfile: SyncPerformanceProfile = {};

  /**
   * Records a timestamp for a pipeline milestone (T0..T15)
   */
  static mark(label: keyof SyncPerformanceProfile): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.marks.set(label, now);
    (this.latestProfile as any)[label] = now;
  }

  /**
   * Computes stage duration between two marks in milliseconds
   */
  static duration(startLabel: keyof SyncPerformanceProfile, endLabel: keyof SyncPerformanceProfile): number {
    const start = this.marks.get(startLabel);
    const end = this.marks.get(endLabel);
    if (start !== undefined && end !== undefined) {
      return Math.round((end - start) * 10) / 10;
    }
    return 0;
  }

  /**
   * Finalizes and calculates all standard pipeline stage metrics
   */
  static finalizeReport(): SyncPerformanceProfile {
    this.latestProfile.sourceExtractionTime = this.duration('t0_submitClicked', 't1_sourceCaptured');
    this.latestProfile.submissionDetectionTime = this.duration('t1_sourceCaptured', 't2_acceptedDetected');
    this.latestProfile.repoValidationTime = this.duration('t5_authRetrieved', 't6_repoVerified');
    this.latestProfile.branchValidationTime = this.duration('t6_repoVerified', 't7_branchVerified');
    this.latestProfile.gitHubReadTime = this.duration('t7_branchVerified', 't8_dirStateRetrieved');
    this.latestProfile.duplicateDetectionTime = this.duration('t8_dirStateRetrieved', 't9_duplicateCheckDone');
    this.latestProfile.solutionUploadTime = this.duration('t10_solutionUploadStart', 't11_solutionUploadDone');
    this.latestProfile.problemReadmeTime = this.duration('t11_solutionUploadDone', 't12_problemReadmeDone');
    this.latestProfile.rootReadmeTime = this.duration('t12_problemReadmeDone', 't13_rootReadmeDone');
    this.latestProfile.localStorageTime = this.duration('t13_rootReadmeDone', 't14_historySaved');
    this.latestProfile.totalSyncTime = this.duration('t4_saveConfirmed', 't15_successUiDone');

    return { ...this.latestProfile };
  }

  /**
   * Retrieves the latest profile summary
   */
  static getLatestProfile(): SyncPerformanceProfile {
    return { ...this.latestProfile };
  }

  /**
   * Resets profiler marks
   */
  static reset(): void {
    this.marks.clear();
    this.latestProfile = {};
  }
}
