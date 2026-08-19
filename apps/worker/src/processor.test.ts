import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HevyWorkoutJob, WorkerEnv } from './contracts';
import { processWorkoutJob } from './processor';

describe('processWorkoutJob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates and snapshots a Hevy workout through the client', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(workoutFixture);
    });
    vi.stubGlobal('fetch', fetch);
    const { env, batch } = createEnv();
    const { message, ack, retry } = createMessage();

    await processWorkoutJob(message, env);

    expect(String(fetch.mock.calls[0]?.[0])).toContain('/v1/workouts/workout-fixture-1');
    expect(batch).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it('retries instead of storing a malformed Hevy response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ malformed: true })),
    );
    const { env, batch } = createEnv();
    const { message, ack, retry } = createMessage();

    await processWorkoutJob(message, env);

    expect(batch).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
  });
});

function createMessage(): {
  message: Message<HevyWorkoutJob>;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
} {
  const ack = vi.fn();
  const retry = vi.fn();
  return {
    message: {
      body: {
        eventId: 'event-fixture-1',
        workoutId: 'workout-fixture-1',
        receivedAt: '2026-08-19T11:01:00Z',
        rulesetVersion: '0.1.0',
      },
      ack,
      retry,
    } as unknown as Message<HevyWorkoutJob>,
    ack,
    retry,
  };
}

function createEnv(): {
  env: WorkerEnv;
  batch: ReturnType<typeof vi.fn>;
} {
  const statement = createStatement();
  const batch = vi.fn(async () => [d1Result()]);
  return {
    env: {
      DB: {
        prepare: vi.fn(() => statement),
        batch,
      } as unknown as D1Database,
      WORKOUT_QUEUE: {} as Queue<HevyWorkoutJob>,
      HEVY_API_BASE_URL: 'https://api.hevyapp.com',
      HEVY_API_KEY: 'test-api-key',
      HEVY_WEBHOOK_AUTHORIZATION: 'Bearer test-webhook-secret',
      RECOMMENDATION_MODE: 'recommendation-only',
    },
    batch,
  };
}

function createStatement(): D1PreparedStatement {
  const statement: Pick<D1PreparedStatement, 'bind' | 'run'> = {
    bind: vi.fn(function bind() {
      return statement as D1PreparedStatement;
    }),
    run: vi.fn(async () => d1Result()) as unknown as D1PreparedStatement['run'],
  };
  return statement as D1PreparedStatement;
}

function d1Result(): D1Result {
  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 1,
      last_row_id: 0,
      changed_db: true,
      changes: 1,
    },
  };
}

const workoutFixture = {
  id: 'workout-fixture-1',
  title: 'Upper Body',
  routine_id: 'routine-fixture-1',
  description: 'Sanitized Worker fixture',
  start_time: '2026-08-19T10:00:00Z',
  end_time: '2026-08-19T11:00:00Z',
  updated_at: '2026-08-19T11:01:00Z',
  created_at: '2026-08-19T11:01:00Z',
  exercises: [
    {
      index: 0,
      title: 'Bench Press (Barbell)',
      notes: '',
      exercise_template_id: 'BENCH001',
      supersets_id: null,
      sets: [
        {
          index: 0,
          type: 'normal',
          weight_kg: 55,
          reps: 11,
          distance_meters: null,
          duration_seconds: null,
          rpe: 9.5,
          custom_metric: null,
        },
      ],
    },
  ],
};
