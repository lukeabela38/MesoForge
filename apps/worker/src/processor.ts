import { createHevyClient } from '@mesoforge/hevy';

import type { HevyWorkoutJob, WorkerEnv } from './contracts';

export async function processWorkoutJob(
  message: Message<HevyWorkoutJob>,
  env: WorkerEnv,
): Promise<void> {
  const { eventId, workoutId } = message.body;
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `UPDATE webhook_events SET status = 'processing', updated_at = ? WHERE id = ?`,
    )
      .bind(now, eventId)
      .run();

    const hevy = createHevyClient({
      apiKey: env.HEVY_API_KEY,
      baseUrl: env.HEVY_API_BASE_URL,
    });
    const workout = await hevy.getWorkout(workoutId);
    const fetchedAt = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO workout_snapshots (workout_id, payload_json, fetched_at)
         VALUES (?, ?, ?)
         ON CONFLICT(workout_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           fetched_at = excluded.fetched_at`,
      ).bind(workoutId, JSON.stringify(workout), fetchedAt),
      env.DB.prepare(
        `UPDATE webhook_events
         SET status = 'awaiting_feedback', processed_at = ?, updated_at = ?, last_error = NULL
         WHERE id = ?`,
      ).bind(fetchedAt, fetchedAt, eventId),
    ]);

    message.ack();
  } catch (error: unknown) {
    await env.DB.prepare(
      `UPDATE webhook_events
       SET status = 'retrying', last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(toErrorMessage(error), new Date().toISOString(), eventId)
      .run();

    message.retry();
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
}
