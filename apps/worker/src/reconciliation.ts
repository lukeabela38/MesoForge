import { RULESET_VERSION } from '@mesoforge/domain';

import type { HevyWorkoutJob, WorkerEnv } from './contracts';

interface InterruptedEvent {
  readonly id: string;
  readonly workout_id: string;
  readonly received_at: string;
}

/**
 * Recovers the insert-before-enqueue gap. A Worker termination or Queue outage
 * can leave a durable event in `received` or `queue_failed`; the scheduled
 * handler safely republishes those events using the same idempotency key.
 */
export async function requeueInterruptedEvents(env: WorkerEnv): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT id, workout_id, received_at
     FROM webhook_events
     WHERE status IN ('received', 'queue_failed')
     ORDER BY received_at ASC
     LIMIT 100`,
  ).all<InterruptedEvent>();

  let requeued = 0;

  for (const event of result.results) {
    const job: HevyWorkoutJob = {
      eventId: event.id,
      workoutId: event.workout_id,
      receivedAt: event.received_at,
      rulesetVersion: RULESET_VERSION,
    };

    try {
      await env.WORKOUT_QUEUE.send(job, { contentType: 'json' });
      await env.DB.prepare(
        `UPDATE webhook_events
         SET status = 'queued', last_error = NULL, updated_at = ?
         WHERE id = ? AND status IN ('received', 'queue_failed')`,
      )
        .bind(new Date().toISOString(), event.id)
        .run();
      requeued += 1;
    } catch (error: unknown) {
      await env.DB.prepare(
        `UPDATE webhook_events
         SET status = 'queue_failed', last_error = ?, updated_at = ?
         WHERE id = ?`,
      )
        .bind(toErrorMessage(error), new Date().toISOString(), event.id)
        .run();
    }
  }

  return requeued;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
}
