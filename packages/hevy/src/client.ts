import type { z } from 'zod';

import { HevyClientError, isHevyClientError } from './errors';
import {
  getRoutineResponseSchema,
  paginatedWorkoutEventsSchema,
  routineSchema,
  updateRoutineRequestSchema,
  workoutEventsQuerySchema,
  workoutSchema,
  type PaginatedWorkoutEvents,
  type Routine,
  type UpdateRoutineRequest,
  type Workout,
  type WorkoutEventsQuery,
} from './schemas';

const DEFAULT_BASE_URL = 'https://api.hevyapp.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_READ_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 5_000;

export type HevyEndpoint =
  '/v1/workouts/:workoutId' | '/v1/workouts/events' | '/v1/routines/:routineId';

export interface HevyDiagnostic {
  readonly level: 'debug' | 'warning' | 'error';
  readonly event: 'request_succeeded' | 'request_retrying' | 'request_failed';
  readonly method: 'GET' | 'PUT';
  readonly endpoint: HevyEndpoint;
  readonly attempt: number;
  readonly status?: number;
  readonly delayMs?: number;
  readonly code?: string;
}

export interface RoutineWritePolicy {
  readonly enabled: boolean;
  readonly allowedRoutineIds: ReadonlySet<string>;
}

export interface HevyClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxReadRetries?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly now?: () => number;
  readonly onDiagnostic?: (diagnostic: HevyDiagnostic) => void;
  readonly routineWritePolicy?: RoutineWritePolicy;
}

export interface HevyClient {
  getWorkout(workoutId: string): Promise<Workout>;
  getWorkoutEvents(query?: WorkoutEventsQuery): Promise<PaginatedWorkoutEvents>;
  getRoutine(routineId: string): Promise<Routine>;
  updateRoutine(routineId: string, request: UpdateRoutineRequest): Promise<Routine>;
}

interface RequestDefinition<T> {
  readonly method: 'GET' | 'PUT';
  readonly endpoint: HevyEndpoint;
  readonly path: string;
  readonly schema: z.ZodType<T>;
  readonly body?: unknown;
  readonly query?: URLSearchParams;
}

export function createHevyClient(options: HevyClientOptions): HevyClient {
  validateOptions(options);

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? abortableSleep;
  const now = options.now ?? Date.now;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxReadRetries = options.maxReadRetries ?? DEFAULT_MAX_READ_RETRIES;
  const writePolicy = options.routineWritePolicy ?? {
    enabled: false,
    allowedRoutineIds: new Set<string>(),
  };

  async function execute<T>(definition: RequestDefinition<T>): Promise<T> {
    const deadline = now() + timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort('Hevy operation deadline exceeded'),
      timeoutMs,
    );
    const maximumAttempts = definition.method === 'GET' ? maxReadRetries + 1 : 1;

    try {
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        try {
          const response = await dispatch(definition, controller.signal);

          if (!response.ok) {
            const error = classifyHttpError(definition, response);
            if (attempt < maximumAttempts && error.retryable) {
              const delayMs = retryDelay(response, attempt, now());
              emit(options, {
                level: response.status === 429 ? 'warning' : 'debug',
                event: 'request_retrying',
                method: definition.method,
                endpoint: definition.endpoint,
                attempt,
                status: response.status,
                delayMs,
                code: error.code,
              });
              await waitWithinDeadline(
                delayMs,
                deadline,
                now,
                sleep,
                controller.signal,
                definition,
              );
              continue;
            }
            throw error;
          }

          const payload = await parseJson(response, definition);
          const parsed = definition.schema.safeParse(payload);
          if (!parsed.success) {
            throw new HevyClientError({
              code: 'contract',
              endpoint: definition.endpoint,
              method: definition.method,
              message: 'Hevy returned a successful response that violates the expected contract',
              status: response.status,
              commitState: definition.method === 'PUT' ? 'unknown' : 'not_sent',
              cause: parsed.error,
            });
          }

          emit(options, {
            level: 'debug',
            event: 'request_succeeded',
            method: definition.method,
            endpoint: definition.endpoint,
            attempt,
            status: response.status,
          });
          return parsed.data;
        } catch (error: unknown) {
          const normalized = normalizeExecutionError(error, definition, controller.signal);
          const retryable =
            definition.method === 'GET' && normalized.retryable && attempt < maximumAttempts;

          if (retryable) {
            const delayMs = retryDelay(undefined, attempt, now());
            emit(options, {
              level: 'debug',
              event: 'request_retrying',
              method: definition.method,
              endpoint: definition.endpoint,
              attempt,
              delayMs,
              code: normalized.code,
            });
            await waitWithinDeadline(delayMs, deadline, now, sleep, controller.signal, definition);
            continue;
          }

          emit(options, {
            level: 'error',
            event: 'request_failed',
            method: definition.method,
            endpoint: definition.endpoint,
            attempt,
            ...(normalized.status === undefined ? {} : { status: normalized.status }),
            code: normalized.code,
          });
          throw normalized;
        }
      }

      throw new Error('Unreachable Hevy request state');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function dispatch<T>(
    definition: RequestDefinition<T>,
    signal: AbortSignal,
  ): Promise<Response> {
    const url = new URL(`${baseUrl}${definition.path}`);
    if (definition.query !== undefined) {
      url.search = definition.query.toString();
    }

    const request: RequestInit = {
      method: definition.method,
      signal,
      headers: {
        accept: 'application/json',
        'api-key': options.apiKey,
        ...(definition.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(definition.body === undefined ? {} : { body: JSON.stringify(definition.body) }),
    };
    return fetchImplementation(url, request);
  }

  return {
    getWorkout(workoutId: string): Promise<Workout> {
      requireIdentifier(workoutId, '/v1/workouts/:workoutId', 'GET');
      return execute({
        method: 'GET',
        endpoint: '/v1/workouts/:workoutId',
        path: `/v1/workouts/${encodeURIComponent(workoutId)}`,
        schema: workoutSchema,
      });
    },

    getWorkoutEvents(query = {}): Promise<PaginatedWorkoutEvents> {
      const parsed = workoutEventsQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new HevyClientError({
          code: 'invalid_input',
          endpoint: '/v1/workouts/events',
          method: 'GET',
          message: 'Invalid workout-events query',
          cause: parsed.error,
        });
      }

      const parameters = new URLSearchParams({
        page: String(parsed.data.page),
        pageSize: String(parsed.data.pageSize),
        since: parsed.data.since,
      });
      return execute({
        method: 'GET',
        endpoint: '/v1/workouts/events',
        path: '/v1/workouts/events',
        query: parameters,
        schema: paginatedWorkoutEventsSchema,
      });
    },

    async getRoutine(routineId: string): Promise<Routine> {
      requireIdentifier(routineId, '/v1/routines/:routineId', 'GET');
      const result = await execute({
        method: 'GET',
        endpoint: '/v1/routines/:routineId',
        path: `/v1/routines/${encodeURIComponent(routineId)}`,
        schema: getRoutineResponseSchema,
      });
      return result.routine;
    },

    updateRoutine(routineId: string, request: UpdateRoutineRequest): Promise<Routine> {
      requireIdentifier(routineId, '/v1/routines/:routineId', 'PUT');
      if (!writePolicy.enabled || !writePolicy.allowedRoutineIds.has(routineId)) {
        throw new HevyClientError({
          code: 'write_blocked',
          endpoint: '/v1/routines/:routineId',
          method: 'PUT',
          message: 'Routine writes are disabled or the routine is not allowlisted',
        });
      }

      const parsed = updateRoutineRequestSchema.safeParse(request);
      if (!parsed.success) {
        throw new HevyClientError({
          code: 'invalid_input',
          endpoint: '/v1/routines/:routineId',
          method: 'PUT',
          message: 'Invalid routine-update request',
          cause: parsed.error,
        });
      }

      return execute({
        method: 'PUT',
        endpoint: '/v1/routines/:routineId',
        path: `/v1/routines/${encodeURIComponent(routineId)}`,
        body: parsed.data,
        schema: routineSchema,
      });
    },
  };
}

function validateOptions(options: HevyClientOptions): void {
  if (options.apiKey.trim().length === 0) {
    throw new Error('Hevy apiKey must not be empty');
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)
  ) {
    throw new Error('Hevy timeoutMs must be a positive integer');
  }
  if (
    options.maxReadRetries !== undefined &&
    (!Number.isInteger(options.maxReadRetries) ||
      options.maxReadRetries < 0 ||
      options.maxReadRetries > 5)
  ) {
    throw new Error('Hevy maxReadRetries must be an integer between 0 and 5');
  }
}

function requireIdentifier(id: string, endpoint: HevyEndpoint, method: 'GET' | 'PUT'): void {
  if (id.trim().length === 0) {
    throw new HevyClientError({
      code: 'invalid_input',
      endpoint,
      method,
      message: 'Hevy resource identifier must not be empty',
    });
  }
}

async function parseJson<T>(
  response: Response,
  definition: RequestDefinition<T>,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error: unknown) {
    throw new HevyClientError({
      code: 'contract',
      endpoint: definition.endpoint,
      method: definition.method,
      message: 'Hevy returned a non-JSON success response',
      status: response.status,
      commitState: definition.method === 'PUT' ? 'unknown' : 'not_sent',
      cause: error,
    });
  }
}

function classifyHttpError<T>(
  definition: RequestDefinition<T>,
  response: Response,
): HevyClientError {
  const common = {
    endpoint: definition.endpoint,
    method: definition.method,
    status: response.status,
    commitState: definition.method === 'PUT' ? ('unknown' as const) : ('not_sent' as const),
  };

  if (response.status === 401 || response.status === 403) {
    return new HevyClientError({
      ...common,
      code: 'authentication',
      message: 'Hevy rejected the API credentials',
    });
  }
  if (response.status === 404) {
    return new HevyClientError({
      ...common,
      code: 'not_found',
      message: 'Hevy resource not found',
    });
  }
  if (response.status === 429) {
    return new HevyClientError({
      ...common,
      code: 'rate_limited',
      message: 'Hevy rate limit exceeded',
      retryable: definition.method === 'GET',
    });
  }
  if (response.status >= 500) {
    return new HevyClientError({
      ...common,
      code: 'server',
      message: 'Hevy server error',
      retryable: definition.method === 'GET',
    });
  }
  return new HevyClientError({ ...common, code: 'http', message: 'Unexpected Hevy HTTP response' });
}

function normalizeExecutionError<T>(
  error: unknown,
  definition: RequestDefinition<T>,
  signal: AbortSignal,
): HevyClientError {
  if (isHevyClientError(error)) return error;
  if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new HevyClientError({
      code: 'timeout',
      endpoint: definition.endpoint,
      method: definition.method,
      message: 'Hevy operation deadline exceeded',
      commitState: definition.method === 'PUT' ? 'unknown' : 'not_sent',
      cause: error,
    });
  }
  return new HevyClientError({
    code: 'network',
    endpoint: definition.endpoint,
    method: definition.method,
    message: 'Hevy network request failed',
    retryable: definition.method === 'GET',
    commitState: definition.method === 'PUT' ? 'unknown' : 'not_sent',
    cause: error,
  });
}

function retryDelay(response: Response | undefined, attempt: number, now: number): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter !== null && retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    }
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(0, date - now), MAX_RETRY_DELAY_MS);
    }
  }
  return Math.min(250 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

async function waitWithinDeadline<T>(
  delayMs: number,
  deadline: number,
  now: () => number,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
  definition: RequestDefinition<T>,
): Promise<void> {
  const remaining = deadline - now();
  if (remaining <= 0 || delayMs >= remaining) {
    throw new HevyClientError({
      code: 'timeout',
      endpoint: definition.endpoint,
      method: definition.method,
      message: 'Hevy operation deadline exceeded before retry',
    });
  }
  await sleep(delayMs, signal);
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function emit(options: HevyClientOptions, diagnostic: HevyDiagnostic): void {
  options.onDiagnostic?.(diagnostic);
}
