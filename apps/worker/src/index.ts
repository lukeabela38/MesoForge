import type { HevyWorkoutJob, WorkerEnv } from './contracts';
import { handleRequest } from './http';
import { processWorkoutJob } from './processor';
import { requeueInterruptedEvents } from './reconciliation';

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  },

  async queue(batch: MessageBatch<HevyWorkoutJob>, env: WorkerEnv): Promise<void> {
    await Promise.all(batch.messages.map((message) => processWorkoutJob(message, env)));
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const checkedAt = new Date().toISOString();
    await requeueInterruptedEvents(env);
    await env.DB.prepare(
      `INSERT INTO sync_state (key, value, updated_at)
       VALUES ('reconciliation:last_checked_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(checkedAt, checkedAt)
      .run();
  },
};
