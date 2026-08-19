import { z } from 'zod';

const isoTimestampSchema = z.string().datetime({ offset: true });
const setTypeSchema = z.enum(['warmup', 'normal', 'failure', 'dropset']);
const nullableMetricSchema = z.number().nonnegative().nullable();

export const workoutSetSchema = z
  .object({
    index: z.number().int().nonnegative(),
    type: setTypeSchema,
    weight_kg: nullableMetricSchema,
    reps: nullableMetricSchema,
    distance_meters: nullableMetricSchema,
    duration_seconds: nullableMetricSchema,
    rpe: z.number().min(0).max(10).nullable(),
    custom_metric: nullableMetricSchema,
  })
  .passthrough();

export const workoutExerciseSchema = z
  .object({
    index: z.number().int().nonnegative(),
    title: z.string(),
    notes: z.string(),
    exercise_template_id: z.string().min(1),
    supersets_id: z.number().int().nullable(),
    sets: z.array(workoutSetSchema),
  })
  .passthrough();

export const workoutSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    routine_id: z.string().min(1).nullable(),
    description: z.string(),
    start_time: isoTimestampSchema,
    end_time: isoTimestampSchema,
    updated_at: isoTimestampSchema,
    created_at: isoTimestampSchema,
    exercises: z.array(workoutExerciseSchema),
  })
  .passthrough();

export const repRangeSchema = z.object({
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().nonnegative().nullable(),
});

export const routineSetSchema = z
  .object({
    index: z.number().int().nonnegative(),
    type: setTypeSchema,
    weight_kg: nullableMetricSchema,
    reps: nullableMetricSchema,
    rep_range: repRangeSchema.nullable(),
    distance_meters: nullableMetricSchema,
    duration_seconds: nullableMetricSchema,
    rpe: z.number().min(0).max(10).nullable(),
    custom_metric: nullableMetricSchema,
  })
  .passthrough();

export const routineExerciseSchema = z
  .object({
    index: z.number().int().nonnegative(),
    title: z.string(),
    rest_seconds: z.number().int().nonnegative(),
    notes: z.string(),
    exercise_template_id: z.string().min(1),
    supersets_id: z.number().int().nullable(),
    sets: z.array(routineSetSchema),
  })
  .passthrough();

export const routineSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    folder_id: z.number().int().nullable(),
    updated_at: isoTimestampSchema,
    created_at: isoTimestampSchema,
    exercises: z.array(routineExerciseSchema),
  })
  .passthrough();

export const getRoutineResponseSchema = z
  .object({
    routine: routineSchema,
  })
  .passthrough();

export const deletedWorkoutEventSchema = z
  .object({
    type: z.literal('deleted'),
    id: z.string().min(1),
    deleted_at: isoTimestampSchema.optional(),
  })
  .passthrough();

export const updatedWorkoutEventSchema = z
  .object({
    type: z.literal('updated'),
    workout: workoutSchema,
  })
  .passthrough();

export const workoutEventSchema = z.discriminatedUnion('type', [
  updatedWorkoutEventSchema,
  deletedWorkoutEventSchema,
]);

export const paginatedWorkoutEventsSchema = z
  .object({
    page: z.number().int().positive(),
    page_count: z.number().int().nonnegative(),
    events: z.array(workoutEventSchema),
  })
  .passthrough();

export const routineWriteSetSchema = z.object({
  type: setTypeSchema,
  weight_kg: nullableMetricSchema.optional(),
  reps: z.number().int().nonnegative().nullable().optional(),
  distance_meters: z.number().int().nonnegative().nullable().optional(),
  duration_seconds: z.number().int().nonnegative().nullable().optional(),
  custom_metric: nullableMetricSchema.optional(),
  rep_range: repRangeSchema.nullable().optional(),
});

export const routineWriteExerciseSchema = z.object({
  exercise_template_id: z.string().min(1),
  superset_id: z.number().int().nullable(),
  rest_seconds: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  sets: z.array(routineWriteSetSchema),
});

export const updateRoutineRequestSchema = z.object({
  routine: z.object({
    title: z.string().min(1),
    notes: z.string().nullable(),
    exercises: z.array(routineWriteExerciseSchema),
  }),
});

export const workoutEventsQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(10).default(5),
  since: isoTimestampSchema.default('1970-01-01T00:00:00Z'),
});

export type Workout = z.infer<typeof workoutSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type PaginatedWorkoutEvents = z.infer<typeof paginatedWorkoutEventsSchema>;
export type UpdateRoutineRequest = z.infer<typeof updateRoutineRequestSchema>;
export type WorkoutEventsQuery = z.input<typeof workoutEventsQuerySchema>;
