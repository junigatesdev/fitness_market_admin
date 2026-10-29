import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from './model';

const api = vi.hoisted(() => ({
  listExercises: vi.fn(), listMuscleGroups: vi.fn(), listTags: vi.fn(), saveExercise: vi.fn(),
  setPublished: vi.fn(), deleteExercise: vi.fn(),
  addMuscleGroup: vi.fn(), renameMuscleGroup: vi.fn(), deleteMuscleGroup: vi.fn(), reorderMuscleGroups: vi.fn(),
  addTag: vi.fn(), renameTag: vi.fn(), deleteTag: vi.fn(), reorderTags: vi.fn(),
}));
vi.mock('./api', () => api);

import { ExercisesPage } from './ExercisesPage';

const GROUPS = [
  { id: 'g-other', name: 'Other', sortOrder: 0, isDefault: true, exerciseCount: 0 },
  { id: 'g-chest', name: 'Chest', sortOrder: 1, isDefault: false, exerciseCount: 1 },
  { id: 'g-core', name: 'Core', sortOrder: 2, isDefault: false, exerciseCount: 1 },
];
const TAGS = [
  { id: 't-chest', name: 'Chest day', sortOrder: 1, exerciseCount: 1 },
  { id: 't-core', name: 'Core', sortOrder: 2, exerciseCount: 1 },
];
const EXERCISES: Exercise[] = [
  {
    id: 'e1', name: 'Incline dumbbell press', muscleGroupId: 'g-chest', equipment: 'Dumbbell', difficulty: 'INTERMEDIATE',
    instructions: '', measure: 'REPS', defaultSets: 3, defaultTarget: 8, usesWeight: true, published: true, tagIds: ['t-chest'],
  },
  {
    id: 'e2', name: 'Plank', muscleGroupId: 'g-core', equipment: 'Bodyweight', difficulty: 'BEGINNER',
    instructions: '', measure: 'SECONDS', defaultSets: 3, defaultTarget: 45, usesWeight: false, published: false, tagIds: ['t-core'],
  },
];

beforeEach(() => {
  api.listExercises.mockResolvedValue(EXERCISES);
  api.listMuscleGroups.mockResolvedValue(GROUPS);
  api.listTags.mockResolvedValue(TAGS);
  for (const k of [
    'saveExercise', 'setPublished', 'deleteExercise', 'addMuscleGroup', 'renameMuscleGroup', 'deleteMuscleGroup',
    'reorderMuscleGroups', 'addTag', 'renameTag', 'deleteTag', 'reorderTags',
  ] as const) api[k].mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const card = (name: string) => screen.getByText(name).closest('li')!;

describe('ExercisesPage list', () => {
  it('lists exercises with group, equipment, defaults, tags and status', async () => {
    render(<ExercisesPage />);
    await screen.findByText('Incline dumbbell press');
    const press = within(card('Incline dumbbell press'));
    expect(press.getByText('Chest · Dumbbell · Intermediate')).toBeTruthy();
    expect(press.getByText('3 × 8 reps · with weight')).toBeTruthy();
    expect(press.getByText('Chest day')).toBeTruthy();
    expect(press.getByText('Published')).toBeTruthy();
    const plank = within(card('Plank'));
    expect(plank.getByText('3 × 45 s')).toBeTruthy();
    expect(plank.getByText('Draft')).toBeTruthy();
  });

  it('filters by search, muscle group and tag', async () => {
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.selectOptions(screen.getByLabelText('Filter by muscle group'), 'g-chest');
    expect(screen.queryByText('Plank')).toBeNull();
    expect(screen.getByText('1 of 2 exercises')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Filter by muscle group'), '');
    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 't-core');
    expect(screen.queryByText('Incline dumbbell press')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), '');
    await userEvent.type(screen.getByLabelText('Search exercises'), 'dumbbell');
    expect(screen.queryByText('Plank')).toBeNull();
    expect(screen.getByText('Incline dumbbell press')).toBeTruthy();
  });

  it('publishes and unpublishes', async () => {
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.click(within(card('Plank')).getByRole('button', { name: 'Publish' }));
    expect(api.setPublished).toHaveBeenCalledWith('e2', true);
    await userEvent.click(within(card('Incline dumbbell press')).getByRole('button', { name: 'Unpublish' }));
    expect(api.setPublished).toHaveBeenCalledWith('e1', false);
  });

  it('explains what to run when the tables are missing', async () => {
    api.listExercises.mockRejectedValue(new Error('Could not load exercises: relation "public.exercises" does not exist'));
    render(<ExercisesPage />);
    expect(await screen.findByText(/0007_exercises\.sql/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows the empty state', async () => {
    api.listExercises.mockResolvedValue([]);
    render(<ExercisesPage />);
    expect(await screen.findByText('No exercises yet')).toBeTruthy();
  });
});

describe('ExerciseEditor', () => {
  it('adds an exercise: draft by default, seconds change the label, tags are saved', async () => {
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.click(screen.getByRole('button', { name: 'Add exercise' }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Exercise name'), 'Wall sit');
    await userEvent.selectOptions(dialog.getByLabelText('Main muscle group'), 'g-core');
    await userEvent.click(dialog.getByRole('radio', { name: 'Seconds' }));
    const seconds = dialog.getByRole('textbox', { name: 'Seconds' });
    await userEvent.clear(seconds);
    await userEvent.type(seconds, '40');
    await userEvent.click(dialog.getByLabelText('Customer logs weight for this exercise'));
    await userEvent.click(dialog.getByLabelText('Core'));
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

    expect(api.saveExercise).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Wall sit', muscle_group_id: 'g-core', measure: 'SECONDS', default_sets: 3, default_target: 40,
      uses_weight: false, published: false, tag_ids: ['t-core'],
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows validation errors and does not save', async () => {
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.click(screen.getByRole('button', { name: 'Add exercise' }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Exercise name'), 'plank');
    await userEvent.clear(dialog.getByLabelText('Sets'));
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    expect(dialog.getByText('Another exercise already has this name.')).toBeTruthy();
    expect(dialog.getByText(/Sets must be a whole number/)).toBeTruthy();
    expect(api.saveExercise).not.toHaveBeenCalled();
  });

  it('edits an existing exercise and keeps its id', async () => {
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.click(within(card('Plank')).getByRole('button', { name: 'Edit' }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.clear(dialog.getByLabelText('Sets'));
    await userEvent.type(dialog.getByLabelText('Sets'), '5');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    expect(api.saveExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2', default_sets: 5, tag_ids: ['t-core'] }));
  });

  it('deletes after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.click(within(card('Plank')).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete exercise' }));
    expect(api.deleteExercise).toHaveBeenCalledWith('e2');
  });
});

describe('Muscle groups & tags', () => {
  async function open() {
    render(<ExercisesPage />);
    await screen.findByText('Plank');
    await userEvent.click(screen.getByRole('button', { name: 'Manage groups & tags' }));
    await screen.findByRole('region', { name: 'Tags' });
  }
  const region = (name: string) => within(screen.getByRole('region', { name }));

  it('shows counts; the default group has no delete or move buttons', async () => {
    await open();
    const other = within(region('Muscle groups').getByText('Other').closest('li')!);
    expect(other.getByText('Default')).toBeTruthy();
    expect(other.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(other.queryByRole('button', { name: /Move/ })).toBeNull();
    expect(within(region('Tags').getByText('Chest day').closest('li')!).getByText('1 exercise')).toBeTruthy();
  });

  it('adds a tag at the end and rejects a duplicate without calling the server', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('New tag name'), 'Pull');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(api.addTag).toHaveBeenCalledWith('Pull', 3);

    await userEvent.type(screen.getByLabelText('New muscle group name'), 'chest');
    await userEvent.click(screen.getByRole('button', { name: 'Add muscle group' }));
    expect(api.addMuscleGroup).not.toHaveBeenCalled();
    expect(screen.getByText('A muscle group with this name already exists.')).toBeTruthy();
  });

  it('deleting a group warns that its exercises move to Other', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await open();
    await userEvent.click(within(region('Muscle groups').getByText('Chest').closest('li')!).getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('will move to “Other”'));
    expect(api.deleteMuscleGroup).toHaveBeenCalledWith('g-chest');
  });

  it('renames and reorders', async () => {
    await open();
    const chest = within(region('Muscle groups').getByText('Chest').closest('li')!);
    await userEvent.click(chest.getByRole('button', { name: 'Move Chest down' }));
    expect(api.reorderMuscleGroups).toHaveBeenCalledWith(['g-other', 'g-core', 'g-chest']);

    await userEvent.click(within(region('Tags').getByText('Core').closest('li')!).getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename Core');
    await userEvent.clear(input);
    await userEvent.type(input, 'Abs');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.renameTag).toHaveBeenCalledWith('t-core', 'Abs');
  });
});
