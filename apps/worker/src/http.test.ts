import { describe, expect, it, vi } from 'vitest';

import type { HevyWorkoutJob, WorkerEnv } from './contracts';
import { handleRequest } from './http';

const validWorkoutId = 'f1085cdb-32b2-4003-967d-53a3af8eaecb';

describe('handleRequest', () => {
  it('reports health without exposing secrets', async () => {
    const env = createEnv();
    const response = await handleRequest(new Request('https://example.test/health'), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      mode: 'recommendation-only',
    });
  });

  it('rejects an invalid authorization header', async () => {
    const env = createEnv();
    const response = await handleRequest(
      webhookRequest({ workoutId: validWorkoutId }, 'Bearer incorrect'),
      env,
    );

    expect(response.status).toBe(401);
    expect(env.WORKOUT_QUEUE.send).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads', async () => {
    const env = createEnv();
    const response = await handleRequest(webhookRequest({ workoutId: 'not-a-uuid' }), env);

    expect(response.status).toBe(400);
    expect(env.WORKOUT_QUEUE.send).not.toHaveBeenCalled();
  });

  it('persists and enqueues a new workout once', async () => {
    const env = createEnv(1);
    const response = await handleRequest(webhookRequest({ workoutId: validWorkoutId }), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, duplicate: false });
    expect(env.WORKOUT_QUEUE.send).toHaveBeenCalledOnce();
  });

  it('acknowledges a duplicate without enqueuing it again', async () => {
    const env = createEnv(0);
    const response = await handleRequest(webhookRequest({ workoutId: validWorkoutId }), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, duplicate: true });
    expect(env.WORKOUT_QUEUE.send).not.toHaveBeenCalled();
  });
});

function webhookRequest(body: unknown, authorization = 'Bearer test-webhook-secret'): Request {
  return new Request('https://example.test/webhooks/hevy', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function createEnv(insertChanges = 1): WorkerEnv {
  const statement: Pick<D1PreparedStatement, 'bind' | 'run'> = {
    bind: vi.fn(function bind() {
      return statement as D1PreparedStatement;
    }),
    run: vi.fn(async () => ({
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: insertChanges,
        last_row_id: 0,
        changed_db: insertChanges > 0,
        changes: insertChanges,
      },
      results: [],
    })) as unknown as D1PreparedStatement['run'],
  };

  return {
    DB: {
      prepare: vi.fn(() => statement as D1PreparedStatement),
    } as unknown as D1Database,
    WORKOUT_QUEUE: {
      send: vi.fn(async () => undefined),
    } as unknown as Queue<HevyWorkoutJob>,
    HEVY_API_BASE_URL: 'https://api.hevyapp.com/v1',
    HEVY_API_KEY: 'test-api-key',
    HEVY_WEBHOOK_AUTHORIZATION: 'Bearer test-webhook-secret',
    RECOMMENDATION_MODE: 'recommendation-only',
  };
}
