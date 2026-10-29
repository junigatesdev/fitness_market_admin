import { describe, expect, it } from 'vitest';
import {
  blankExercise, formatDefault, parseWhole, sortGroups, toDraft, toPayload, validateDraft, validateListName,
  type Exercise,
} from './model';

const EXERCISE: Exercise = {
  id: 'e1', name: 'Incline dumbbell press', muscleGroupId: 'g-chest', equipment: 'Dumbbell', difficulty: 'INTERMEDIATE',
  instructions: 'Press.', measure: 'REPS', defaultSets: 3, defaultTarget: 8, usesWeight: true, published: true,
  tagIds: ['t1', 't2'],
};

describe('formatDefault', () => {
  it('shows reps or seconds', () => {
    expect(formatDefault(EXERCISE)).toBe('3 × 8 reps');
    expect(formatDefault({ ...EXERCISE, measure: 'SECONDS', defaultTarget: 45 })).toBe('3 × 45 s');
  });
});

describe('parseWhole', () => {
  it('accepts whole numbers only', () => {
    expect(parseWhole(' 12 ')).toBe(12);
    for (const bad of ['', '1.5', '-3', 'abc', '1e3']) expect(parseWhole(bad)).toBeNaN();
  });
});

describe('validateDraft', () => {
  const ok = { ...toDraft(EXERCISE) };

  it('accepts a complete exercise', () => {
    expect(validateDraft(ok, [])).toEqual([]);
  });

  it('requires a name, rejects duplicates case-insensitively and over-long names', () => {
    expect(validateDraft({ ...ok, name: '  ' }, [])).toContain('Exercise name is required.');
    expect(validateDraft({ ...ok, name: 'PLANK' }, ['Plank'])).toContain('Another exercise already has this name.');
    expect(validateDraft({ ...ok, name: 'x'.repeat(101) }, [])[0]).toMatch(/at most 100/);
  });

  it('checks sets and reps/seconds ranges, naming the unit', () => {
    expect(validateDraft({ ...ok, defaultSets: '0' }, [])[0]).toMatch(/Sets must be/);
    expect(validateDraft({ ...ok, defaultSets: '21' }, [])[0]).toMatch(/Sets must be/);
    expect(validateDraft({ ...ok, defaultTarget: '1000' }, [])[0]).toMatch(/^Reps must be/);
    expect(validateDraft({ ...ok, measure: 'SECONDS', defaultTarget: '' }, [])[0]).toMatch(/^Seconds must be/);
  });

  it('needs a muscle group', () => {
    expect(validateDraft({ ...ok, muscleGroupId: '' }, [])).toContain('Pick a muscle group.');
  });
});

describe('toPayload', () => {
  it('sends trimmed text, numbers, and the tag ids for save_exercise', () => {
    const payload = toPayload({ ...toDraft(EXERCISE), name: '  Row ', equipment: ' Cable ', defaultSets: '4', defaultTarget: '12' });
    expect(payload).toMatchObject({
      id: 'e1', name: 'Row', equipment: 'Cable', default_sets: 4, default_target: 12, measure: 'REPS',
      uses_weight: true, published: true, muscle_group_id: 'g-chest', tag_ids: ['t1', 't2'],
    });
  });

  it('a new exercise starts as an unpublished draft of 3 sets of 10 reps with weight', () => {
    const d = blankExercise('g1');
    expect(d.id).toBeUndefined();
    expect(d).toMatchObject({ published: false, defaultSets: '3', defaultTarget: '10', usesWeight: true, measure: 'REPS' });
  });
});

describe('lists', () => {
  it('validates group and tag names', () => {
    expect(validateListName('Tag', '', [])).toBe('Tag name is required.');
    expect(validateListName('Tag', 'Push', ['push'])).toBe('A tag with this name already exists.');
    expect(validateListName('Muscle group', 'x'.repeat(61), [])).toMatch(/at most 60/);
    expect(validateListName('Tag', 'Pull', ['Push'])).toBeNull();
  });

  it('puts the default group first', () => {
    const g = (id: string, name: string, sortOrder: number, isDefault = false) => ({ id, name, sortOrder, isDefault, exerciseCount: 0 });
    expect(sortGroups([g('b', 'Back', 2), g('o', 'Other', 0, true), g('c', 'Chest', 1)]).map((x) => x.name))
      .toEqual(['Other', 'Chest', 'Back']);
  });
});
