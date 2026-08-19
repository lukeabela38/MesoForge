import { describe, expect, it, vi } from 'vitest';

import { createHevyClient, type HevyDiagnostic } from './client';
import { HevyClientError } from './errors';
import { routineFixture, updateRoutineFixture, workoutFixture } from '../test/fixtures';

describe('createHevyClient', () => {
  it('authenticates and validates a workout response', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(workoutFixture);
    });
    const client = createHevyClient({ apiKey: 'secret-key', fetch });

    await expect(client.getWorkout('workout-fixture-1')).resolves.toMatchObject({
      id: 'workout-fixture-1',
    });
    const request = fetch.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('api-key')).toBe('secret-key');
  });

  it('fails closed when a successful response violates the contract', async () => {
    const client = createHevyClient({
      apiKey: 'secret-key',
      fetch: vi.fn(async () => Response.json({ unexpected: true })),
      maxReadRetries: 0,
    });

    await expect(client.getWorkout('workout-fixture-1')).rejects.toMatchObject({
      code: 'contract',
    });
  });

  it('validates workout-event pagination and query parameters', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return Response.json({
        page: 1,
        page_count: 1,
        events: [{ type: 'updated', workout: workoutFixture }],
      });
    });
    const client = createHevyClient({ apiKey: 'secret-key', fetch });

    const result = await client.getWorkoutEvents({
      page: 1,
      pageSize: 10,
      since: '2026-08-01T00:00:00Z',
    });

    expect(result.events).toHaveLength(1);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/v1/workouts/events');
    expect(url.searchParams.get('pageSize')).toBe('10');
    expect(url.searchParams.get('since')).toBe('2026-08-01T00:00:00Z');
  });

  it('unwraps and validates a routine response', async () => {
    const client = createHevyClient({
      apiKey: 'secret-key',
      fetch: vi.fn(async () => Response.json({ routine: routineFixture })),
    });

    await expect(client.getRoutine('routine-fixture-1')).resolves.toMatchObject({
      id: 'routine-fixture-1',
    });
  });

  it('retries a transient read and then succeeds', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(workoutFixture));
    const sleep = vi.fn(async () => undefined);
    const client = createHevyClient({ apiKey: 'secret-key', fetch, sleep });

    await expect(client.getWorkout('workout-fixture-1')).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250, expect.any(AbortSignal));
  });

  it('honors a bounded Retry-After value', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(Response.json(workoutFixture));
    const sleep = vi.fn(async () => undefined);
    const client = createHevyClient({ apiKey: 'secret-key', fetch, sleep });

    await client.getWorkout('workout-fixture-1');
    expect(sleep).toHaveBeenCalledWith(2_000, expect.any(AbortSignal));
  });

  it('enforces one absolute operation deadline', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void input;
      return new Promise((resolve, reject) => {
        void resolve;
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const client = createHevyClient({
      apiKey: 'secret-key',
      fetch,
      timeoutMs: 5,
      maxReadRetries: 2,
    });

    await expect(client.getWorkout('workout-fixture-1')).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('blocks routine writes by default before dispatch', () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createHevyClient({ apiKey: 'secret-key', fetch });

    expect(() => client.updateRoutine('sandbox-routine', updateRoutineFixture)).toThrow(
      HevyClientError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows an explicitly allowlisted sandbox routine', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(routineFixture);
    });
    const client = createHevyClient({
      apiKey: 'secret-key',
      fetch,
      routineWritePolicy: {
        enabled: true,
        allowedRoutineIds: new Set(['sandbox-routine']),
      },
    });

    await expect(
      client.updateRoutine('sandbox-routine', updateRoutineFixture),
    ).resolves.toBeDefined();
    const request = fetch.mock.calls[0]?.[1];
    expect(request?.method).toBe('PUT');
    expect(JSON.parse(String(request?.body))).toMatchObject({
      routine: {
        exercises: [{ superset_id: null }],
      },
    });
  });

  it('never retries an ambiguous routine-write network failure', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('connection reset');
    });
    const client = createHevyClient({
      apiKey: 'secret-key',
      fetch,
      routineWritePolicy: {
        enabled: true,
        allowedRoutineIds: new Set(['sandbox-routine']),
      },
    });

    await expect(
      client.updateRoutine('sandbox-routine', updateRoutineFixture),
    ).rejects.toMatchObject({
      code: 'network',
      commitState: 'unknown',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('emits privacy-bounded diagnostics with normalized endpoints', async () => {
    const diagnostics: HevyDiagnostic[] = [];
    const client = createHevyClient({
      apiKey: 'do-not-log-this',
      fetch: vi.fn(async () => new Response(null, { status: 401 })),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      maxReadRetries: 0,
    });

    await expect(client.getWorkout('private-workout-id')).rejects.toBeDefined();
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).toContain('/v1/workouts/:workoutId');
    expect(serialized).not.toContain('do-not-log-this');
    expect(serialized).not.toContain('private-workout-id');
  });
});
