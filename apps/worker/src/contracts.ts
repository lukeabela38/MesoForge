import { z } from 'zod';

export const hevyWebhookSchema = z
  .object({
    workoutId: z.string().uuid(),
  })
  .strict();

export interface HevyWorkoutJob {
  readonly eventId: string;
  readonly workoutId: string;
  readonly receivedAt: string;
  readonly rulesetVersion: string;
}

export interface WorkerEnv {
  readonly DB: D1Database;
  readonly WORKOUT_QUEUE: Queue<HevyWorkoutJob>;
  readonly HEVY_API_BASE_URL: string;
  readonly HEVY_API_KEY: string;
  readonly HEVY_WEBHOOK_AUTHORIZATION: string;
  readonly RECOMMENDATION_MODE: 'recommendation-only' | 'write-enabled';
}
