import { describe, expect, it } from 'vitest';

import { createPendingRecommendation, RULESET_VERSION } from './recommendation';

describe('createPendingRecommendation', () => {
  it('requires feedback and prevents external writes', () => {
    const result = createPendingRecommendation({
      workoutId: 'workout-1',
      completedAt: '2026-08-19T10:00:00.000Z',
      workingSets: [
        {
          exerciseId: 'bench-press',
          loadKg: 55,
          repetitions: 11,
          reportedRir: 0.5,
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'pending-feedback',
      externalWriteAllowed: false,
      rulesetVersion: RULESET_VERSION,
    });
    expect(result.requiredFeedback).toEqual(['pump', 'workload', 'jointPain', 'recovery']);
  });

  it('rejects an impossible RIR value', () => {
    expect(() =>
      createPendingRecommendation({
        workoutId: 'workout-1',
        completedAt: '2026-08-19T10:00:00.000Z',
        workingSets: [
          {
            exerciseId: 'bench-press',
            loadKg: 55,
            repetitions: 11,
            reportedRir: 11,
          },
        ],
      }),
    ).toThrow('reportedRir');
  });
});
