import type { Routine, UpdateRoutineRequest, Workout } from '../src/schemas';

export const workoutFixture: Workout = {
  id: 'workout-fixture-1',
  title: 'Upper Body',
  routine_id: 'routine-fixture-1',
  description: 'Sanitized contract fixture',
  start_time: '2026-08-19T10:00:00Z',
  end_time: '2026-08-19T11:00:00Z',
  updated_at: '2026-08-19T11:01:00Z',
  created_at: '2026-08-19T11:01:00Z',
  exercises: [
    {
      index: 0,
      title: 'Bench Press (Barbell)',
      notes: '',
      exercise_template_id: 'BENCH001',
      supersets_id: null,
      sets: [
        {
          index: 0,
          type: 'warmup',
          weight_kg: 30,
          reps: 15,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        },
        {
          index: 1,
          type: 'normal',
          weight_kg: 55,
          reps: 11,
          distance_meters: null,
          duration_seconds: null,
          rpe: 9.5,
          custom_metric: null,
        },
      ],
    },
  ],
};

export const routineFixture: Routine = {
  id: 'routine-fixture-1',
  title: 'Upper Body',
  folder_id: 1,
  updated_at: '2026-08-19T09:00:00Z',
  created_at: '2026-01-01T09:00:00Z',
  exercises: [
    {
      index: 0,
      title: 'Bench Press (Barbell)',
      rest_seconds: 120,
      notes: 'Target: 2 RIR',
      exercise_template_id: 'BENCH001',
      supersets_id: null,
      sets: [
        {
          index: 0,
          type: 'normal',
          weight_kg: 55,
          reps: null,
          rep_range: { start: 8, end: 12 },
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        },
      ],
    },
  ],
};

export const updateRoutineFixture: UpdateRoutineRequest = {
  routine: {
    title: 'MesoForge Sandbox',
    notes: 'Sanitized write-contract fixture',
    exercises: [
      {
        exercise_template_id: 'BENCH001',
        superset_id: null,
        rest_seconds: 120,
        notes: 'Target: 2 RIR',
        sets: [
          {
            type: 'normal',
            weight_kg: 55,
            reps: null,
            rep_range: { start: 8, end: 12 },
          },
        ],
      },
    ],
  },
};
