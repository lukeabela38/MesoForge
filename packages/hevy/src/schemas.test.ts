import { describe, expect, it } from 'vitest';

import { routineSchema, updateRoutineRequestSchema, workoutSchema } from './schemas';
import { routineFixture, updateRoutineFixture, workoutFixture } from '../test/fixtures';

describe('Hevy runtime schemas', () => {
  it('accepts a completed workout with warm-up, working-set and RPE data', () => {
    expect(workoutSchema.parse(workoutFixture)).toMatchObject({ id: 'workout-fixture-1' });
  });

  it('accepts a routine with a prescribed rep range', () => {
    expect(routineSchema.parse(routineFixture)).toMatchObject({ id: 'routine-fixture-1' });
  });

  it('preserves Hevy read/write superset field names', () => {
    const read = routineSchema.parse(routineFixture);
    const write = updateRoutineRequestSchema.parse(updateRoutineFixture);

    expect(read.exercises[0]?.supersets_id).toBeNull();
    expect(write.routine.exercises[0]?.superset_id).toBeNull();
  });

  it('rejects malformed successful workout data', () => {
    expect(() => workoutSchema.parse({ ...workoutFixture, exercises: 'not-an-array' })).toThrow();
  });
});
