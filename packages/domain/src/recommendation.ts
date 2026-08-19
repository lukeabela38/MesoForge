export const RULESET_VERSION = '0.1.0' as const;

export interface WorkingSetPerformance {
  readonly exerciseId: string;
  readonly loadKg: number;
  readonly repetitions: number;
  readonly reportedRir: number | null;
}

export interface SessionPerformance {
  readonly workoutId: string;
  readonly completedAt: string;
  readonly workingSets: readonly WorkingSetPerformance[];
}

export interface PendingRecommendation {
  readonly workoutId: string;
  readonly status: 'pending-feedback';
  readonly rulesetVersion: typeof RULESET_VERSION;
  readonly externalWriteAllowed: false;
  readonly requiredFeedback: readonly ['pump', 'workload', 'jointPain', 'recovery'];
  readonly rationale: readonly string[];
}

/**
 * Creates the safe initial domain result after a workout is ingested.
 *
 * Load, repetitions, and set count deliberately remain unresolved until the
 * hypertrophy rules and subjective feedback contract are implemented. This
 * prevents infrastructure scaffolding from silently becoming training policy.
 */
export function createPendingRecommendation(
  performance: SessionPerformance,
): PendingRecommendation {
  assertSessionPerformance(performance);

  return {
    workoutId: performance.workoutId,
    status: 'pending-feedback',
    rulesetVersion: RULESET_VERSION,
    externalWriteAllowed: false,
    requiredFeedback: ['pump', 'workload', 'jointPain', 'recovery'],
    rationale: [
      'Objective workout performance has been captured.',
      'Subjective stimulus and recovery feedback is required before volume changes.',
      'External routine writes are disabled in recommendation-only mode.',
    ],
  };
}

function assertSessionPerformance(performance: SessionPerformance): void {
  if (performance.workoutId.trim().length === 0) {
    throw new Error('workoutId must not be empty');
  }

  if (Number.isNaN(Date.parse(performance.completedAt))) {
    throw new Error('completedAt must be an ISO-8601 timestamp');
  }

  for (const set of performance.workingSets) {
    if (set.loadKg < 0 || !Number.isFinite(set.loadKg)) {
      throw new Error('loadKg must be a finite, non-negative number');
    }

    if (!Number.isInteger(set.repetitions) || set.repetitions < 0) {
      throw new Error('repetitions must be a non-negative integer');
    }

    if (
      set.reportedRir !== null &&
      (!Number.isFinite(set.reportedRir) || set.reportedRir < 0 || set.reportedRir > 10)
    ) {
      throw new Error('reportedRir must be null or between 0 and 10');
    }
  }
}
