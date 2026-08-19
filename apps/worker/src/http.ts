import { RULESET_VERSION } from '@mesoforge/domain';

import { hevyWebhookSchema, type HevyWorkoutJob, type WorkerEnv } from './contracts';

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ status: 'ok', mode: env.RECOMMENDATION_MODE });
  }

  if (request.method === 'POST' && url.pathname === '/webhooks/hevy') {
    return handleHevyWebhook(request, env);
  }

  return json({ error: 'not_found' }, 404);
}

async function handleHevyWebhook(request: Request, env: WorkerEnv): Promise<Response> {
  const authorization = request.headers.get('authorization');
  if (
    authorization === null ||
    !(await secureEqual(authorization, env.HEVY_WEBHOOK_AUTHORIZATION))
  ) {
    return json({ error: 'unauthorized' }, 401);
  }

  const payload = await readJson(request);
  const parsed = hevyWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const eventId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const insert = await env.DB.prepare(
    `INSERT INTO webhook_events (id, workout_id, status, received_at)
     VALUES (?, ?, 'received', ?)
     ON CONFLICT(workout_id) DO NOTHING`,
  )
    .bind(eventId, parsed.data.workoutId, receivedAt)
    .run();

  if ((insert.meta.changes ?? 0) === 0) {
    return json({ accepted: true, duplicate: true });
  }

  const job: HevyWorkoutJob = {
    eventId,
    workoutId: parsed.data.workoutId,
    receivedAt,
    rulesetVersion: RULESET_VERSION,
  };

  try {
    await env.WORKOUT_QUEUE.send(job, { contentType: 'json' });
    await env.DB.prepare(`UPDATE webhook_events SET status = 'queued', updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), eventId)
      .run();
  } catch (error: unknown) {
    await env.DB.prepare(
      `UPDATE webhook_events
       SET status = 'queue_failed', last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(toErrorMessage(error), new Date().toISOString(), eventId)
      .run();

    return json({ error: 'temporarily_unavailable' }, 503);
  }

  return json({ accepted: true, duplicate: false });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function secureEqual(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;

  for (let index = 0; index < actualBytes.length; index += 1) {
    difference |= actualBytes[index]! ^ expectedBytes[index]!;
  }

  return difference === 0;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
}
