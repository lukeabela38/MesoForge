import { z } from 'zod';

import type { HevyClient } from './client';
import { isHevyClientError } from './errors';

export type ReadOnlyHevyClient = Pick<HevyClient, 'getWorkout' | 'getWorkoutEvents' | 'getRoutine'>;

export interface ReadOnlyVerificationSummary {
  readonly status: 'passed';
  readonly workoutEvents: {
    readonly status: 'validated';
    readonly count: number;
  };
  readonly workout: {
    readonly status: 'validated' | 'skipped';
    readonly exerciseCount?: number;
    readonly setCount?: number;
  };
  readonly routine: {
    readonly status: 'validated' | 'skipped';
    readonly exerciseCount?: number;
    readonly setCount?: number;
  };
}

export interface SafeVerificationFailure {
  readonly status: 'failed';
  readonly error: {
    readonly name: 'HevyClientError' | 'UnexpectedError';
    readonly code?: string;
    readonly endpoint?: string;
    readonly method?: string;
    readonly status?: number;
    readonly issues?: ReadonlyArray<{
      readonly path: string;
      readonly code: string;
    }>;
  };
}

export async function verifyReadOnlyHevy(
  client: ReadOnlyHevyClient,
): Promise<ReadOnlyVerificationSummary> {
  const events = await client.getWorkoutEvents({ page: 1, pageSize: 5 });
  const updatedEvent = events.events.find((event) => event.type === 'updated');

  if (updatedEvent === undefined) {
    return {
      status: 'passed',
      workoutEvents: { status: 'validated', count: events.events.length },
      workout: { status: 'skipped' },
      routine: { status: 'skipped' },
    };
  }

  const workout = await client.getWorkout(updatedEvent.workout.id);
  const workoutSummary = {
    status: 'validated' as const,
    exerciseCount: workout.exercises.length,
    setCount: workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0),
  };

  if (workout.routine_id === null) {
    return {
      status: 'passed',
      workoutEvents: { status: 'validated', count: events.events.length },
      workout: workoutSummary,
      routine: { status: 'skipped' },
    };
  }

  const routine = await client.getRoutine(workout.routine_id);
  return {
    status: 'passed',
    workoutEvents: { status: 'validated', count: events.events.length },
    workout: workoutSummary,
    routine: {
      status: 'validated',
      exerciseCount: routine.exercises.length,
      setCount: routine.exercises.reduce((total, exercise) => total + exercise.sets.length, 0),
    },
  };
}

export function createGetOnlyFetch(fetchImplementation: typeof globalThis.fetch) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (method !== 'GET') {
      throw new Error('Read-only verification blocked a non-GET request');
    }
    return fetchImplementation(input, init);
  };
}

export function formatVerificationFailure(error: unknown): SafeVerificationFailure {
  if (!isHevyClientError(error)) {
    return { status: 'failed', error: { name: 'UnexpectedError' } };
  }

  const issues =
    error.cause instanceof z.ZodError
      ? error.cause.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
        }))
      : undefined;

  return {
    status: 'failed',
    error: {
      name: 'HevyClientError',
      code: error.code,
      endpoint: error.endpoint,
      method: error.method,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(issues === undefined ? {} : { issues }),
    },
  };
}
