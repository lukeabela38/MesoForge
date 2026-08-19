import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { HevyClientError } from './errors';
import {
  createGetOnlyFetch,
  formatVerificationFailure,
  verifyReadOnlyHevy,
} from './read-only-verifier';
import { routineFixture, workoutFixture } from '../test/fixtures';

describe('read-only Hevy verification', () => {
  it('validates events and referenced resources without exposing their content', async () => {
    const client = {
      getWorkoutEvents: vi.fn(async () => ({
        page: 1,
        page_count: 1,
        events: [{ type: 'updated' as const, workout: workoutFixture }],
      })),
      getWorkout: vi.fn(async () => workoutFixture),
      getRoutine: vi.fn(async () => routineFixture),
    };

    const summary = await verifyReadOnlyHevy(client);
    const serialized = JSON.stringify(summary);

    expect(client.getWorkout).toHaveBeenCalledOnce();
    expect(client.getRoutine).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({
      status: 'passed',
      workout: { status: 'validated', exerciseCount: 1, setCount: 2 },
      routine: { status: 'validated', exerciseCount: 1, setCount: 1 },
    });
    expect(serialized).not.toContain(workoutFixture.id);
    expect(serialized).not.toContain(workoutFixture.title);
    expect(serialized).not.toContain(workoutFixture.description);
    expect(serialized).not.toContain(String(workoutFixture.exercises[0]?.sets[1]?.weight_kg));
  });

  it('skips resource reads when no updated workout is available', async () => {
    const client = {
      getWorkoutEvents: vi.fn(async () => ({ page: 1, page_count: 0, events: [] })),
      getWorkout: vi.fn(),
      getRoutine: vi.fn(),
    };

    await expect(verifyReadOnlyHevy(client)).resolves.toMatchObject({
      status: 'passed',
      workout: { status: 'skipped' },
      routine: { status: 'skipped' },
    });
    expect(client.getWorkout).not.toHaveBeenCalled();
    expect(client.getRoutine).not.toHaveBeenCalled();
  });

  it('blocks non-GET requests before dispatch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const getOnlyFetch = createGetOnlyFetch(fetch);

    await expect(
      getOnlyFetch('https://api.hevyapp.com/v1/routines/private-id', { method: 'PUT' }),
    ).rejects.toThrow('blocked a non-GET request');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports contract paths without raw values', () => {
    const privateValue = 'private-workout-title';
    const cause = z.object({ id: z.number() }).safeParse({ id: privateValue });
    if (cause.success) throw new Error('Expected fixture to fail');
    const failure = formatVerificationFailure(
      new HevyClientError({
        code: 'contract',
        endpoint: '/v1/workouts/:workoutId',
        method: 'GET',
        message: `Do not expose ${privateValue}`,
        cause: cause.error,
      }),
    );

    expect(failure).toMatchObject({
      status: 'failed',
      error: { name: 'HevyClientError', code: 'contract', method: 'GET' },
    });
    expect(JSON.stringify(failure)).not.toContain(privateValue);
  });
});
