import { describe, expect, it, vi } from 'vitest';

import type { HevyWorkoutJob, WorkerEnv } from './contracts';
import { requeueInterruptedEvents } from './reconciliation';

describe('requeueInterruptedEvents', () => {
  it('publishes durable events left behind before enqueue', async () => {
    const statement = createStatement([
      {
        id: 'event-1',
        workout_id: 'f1085cdb-32b2-4003-967d-53a3af8eaecb',
        received_at: '2026-08-19T10:00:00.000Z',
      },
    ]);
    const send = vi.fn(async (message: HevyWorkoutJob) => {
      void message;
    });
    const env = {
      DB: {
        prepare: vi.fn(() => statement),
      } as unknown as D1Database,
      WORKOUT_QUEUE: { send } as unknown as Queue<HevyWorkoutJob>,
    } as WorkerEnv;

    await expect(requeueInterruptedEvents(env)).resolves.toBe(1);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      eventId: 'event-1',
      workoutId: 'f1085cdb-32b2-4003-967d-53a3af8eaecb',
    });
  });
});

function createStatement(results: readonly Record<string, string>[]): D1PreparedStatement {
  const statement: Pick<D1PreparedStatement, 'all' | 'bind' | 'run'> = {
    all: vi.fn(async () => ({
      success: true,
      results,
      meta: emptyMeta(),
    })) as unknown as D1PreparedStatement['all'],
    bind: vi.fn(function bind() {
      return statement as D1PreparedStatement;
    }),
    run: vi.fn(async () => ({
      success: true,
      results: [],
      meta: emptyMeta(),
    })) as unknown as D1PreparedStatement['run'],
  };

  return statement as D1PreparedStatement;
}

function emptyMeta(): D1Meta {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
}
