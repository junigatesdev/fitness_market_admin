import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DefaultDay } from './model';

const api = vi.hoisted(() => ({ listDays: vi.fn(), saveDay: vi.fn(), setPublished: vi.fn(), deleteDay: vi.fn(), reorderDays: vi.fn() }));
const exercisesApi = vi.hoisted(() => ({ listExercises: vi.fn(), listMuscleGroups: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('../exercises/api', () => exercisesApi);

import { DefaultDaysPage } from './DefaultDaysPage';

const EXERCISES = [
  { id: 'bench', name: 'Barbell bench press', muscleGroupId: 'g-chest', equipment: 'Barbell', difficulty: 'INTERMEDIATE', instructions: '', measure: 'REPS', defaultSets: 4, defaultTarget: 6, published: true, tagIds: [] },
  { id: 'incline', name: 'Incline dumbbell press', muscleGroupId: 'g-chest', equipment: 'Dumbbell', difficulty: 'INTERMEDIATE', instructions: '', measure: 'REPS', defaultSets: 3, defaultTarget: 8, published: true, tagIds: [] },
  { id: 'lat', name: 'Lat pulldown', muscleGroupId: 'g-back', equipment: 'Machine', difficulty: 'BEGINNER', instructions: '', measure: 'REPS', defaultSets: 3, defaultTarget: 10, published: false, tagIds: [] },
];
const GROUPS = [
  { id: 'g-chest', name: 'Chest', sortOrder: 1, isDefault: false, exerciseCount: 2 },
  { id: 'g-back', name: 'Back', sortOrder: 2, isDefault: false, exerciseCount: 1 },
];
const ex = (key: string, exerciseId: string) => ({ key, kind: 'exercise' as const, name: '', exerciseId, children: [] });
const DAYS: DefaultDay[] = [
  { id: 'd1', name: 'Upper body', sortOrder: 1, published: true, nodes: [
    { key: 'g1', kind: 'group', name: 'Chest', children: [ex('e1', 'bench'), ex('e2', 'incline')] },
    { key: 'g2', kind: 'group', name: 'Back', children: [ex('e3', 'lat')] },
  ] },
  { id: 'd2', name: 'Push', sortOrder: 2, published: false, nodes: [{ key: 'g3', kind: 'group', name: 'Chest', children: [ex('e4', 'bench')] }] },
];

beforeEach(() => {
  api.listDays.mockResolvedValue(DAYS);
  exercisesApi.listExercises.mockResolvedValue(EXERCISES);
  exercisesApi.listMuscleGroups.mockResolvedValue(GROUPS);
  for (const k of ['saveDay', 'setPublished', 'deleteDay', 'reorderDays'] as const) api[k].mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const card = (name: string) => screen.getByText(name).closest('li')!;

describe('DefaultDaysPage list', () => {
  it('lists days with their areas, counts and status', async () => {
    render(<DefaultDaysPage />);
    await screen.findByText('Upper body');
    const upper = within(card('Upper body'));
    expect(upper.getByText('2 areas · 3 exercises')).toBeTruthy();
    expect(upper.getByText('Published')).toBeTruthy();
    expect(within(card('Push')).getByText('Draft')).toBeTruthy();
    expect(screen.getByText('2 default days · 1 published')).toBeTruthy();
  });

  it('publishes, unpublishes and reorders', async () => {
    render(<DefaultDaysPage />);
    await screen.findByText('Push');
    await userEvent.click(within(card('Push')).getByRole('button', { name: 'Publish' }));
    expect(api.setPublished).toHaveBeenCalledWith('d2', true);
    await userEvent.click(within(card('Upper body')).getByRole('button', { name: 'Move Upper body down' }));
    expect(api.reorderDays).toHaveBeenCalledWith(['d2', 'd1']);
  });

  it('explains what to run when the tables are missing', async () => {
    api.listDays.mockRejectedValue(new Error('Could not load default days: relation "public.default_days" does not exist'));
    render(<DefaultDaysPage />);
    expect(await screen.findByText(/0008_default_days\.sql/)).toBeTruthy();
  });

  it('shows the empty state', async () => {
    api.listDays.mockResolvedValue([]);
    render(<DefaultDaysPage />);
    expect(await screen.findByText('No default days yet')).toBeTruthy();
  });
});

describe('DefaultDayEditor', () => {
  it('builds a day: area, exercises into the chosen group, then saves the tree', async () => {
    render(<DefaultDaysPage />);
    await screen.findByText('Push');
    await userEvent.click(screen.getByRole('button', { name: 'New default day' }));
    const form = within(screen.getByRole('form', { name: 'Default day editor' }));
    await userEvent.type(form.getByLabelText('Name'), 'Chest day');

    await userEvent.click(form.getByRole('button', { name: '+ Add area' }));
    await userEvent.type(form.getByLabelText('Group name'), 'Chest');
    expect(form.getByText('Chest', { selector: 'b' })).toBeTruthy(); // "Adding to: Chest"
    await userEvent.click(form.getByRole('button', { name: 'Add Barbell bench press' }));
    await userEvent.click(form.getByRole('button', { name: 'Add Incline dumbbell press' }));
    expect(form.queryByRole('button', { name: 'Add Barbell bench press' })).toBeNull(); // already in the day
    await userEvent.click(form.getByLabelText('Published (copied to new customers)'));
    await userEvent.click(form.getByRole('button', { name: 'Save default day' }));

    expect(api.saveDay).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Chest day', published: true,
      nodes: [{ name: 'Chest', children: [{ exercise_id: 'bench' }, { exercise_id: 'incline' }] }],
    }));
    expect(screen.queryByRole('form', { name: 'Default day editor' })).toBeNull();
  });

  it('shows validation errors and does not save', async () => {
    render(<DefaultDaysPage />);
    await screen.findByText('Push');
    await userEvent.click(screen.getByRole('button', { name: 'New default day' }));
    const form = within(screen.getByRole('form', { name: 'Default day editor' }));
    await userEvent.type(form.getByLabelText('Name'), 'push');
    await userEvent.click(form.getByRole('button', { name: 'Save default day' }));
    expect(form.getByText('Another day already has this name.')).toBeTruthy();
    expect(form.getByText('Add at least one exercise.')).toBeTruthy();
    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('flags an unpublished exercise as skipped, and edits an existing day keeping its id', async () => {
    render(<DefaultDaysPage />);
    await screen.findByText('Upper body');
    await userEvent.click(within(card('Upper body')).getByRole('button', { name: 'Edit' }));
    const form = within(screen.getByRole('form', { name: 'Default day editor' }));
    expect(form.getByText('Draft, will be skipped')).toBeTruthy();

    await userEvent.click(form.getByRole('button', { name: 'Remove Incline dumbbell press' }));
    await userEvent.click(form.getByRole('button', { name: 'Save default day' }));

    const payload = api.saveDay.mock.calls[0][0];
    expect(payload.id).toBe('d1');
    expect(payload.nodes[0]).toEqual({ name: 'Chest', children: [{ exercise_id: 'bench' }] });
  });

  it('deletes after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DefaultDaysPage />);
    await screen.findByText('Push');
    await userEvent.click(within(card('Push')).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(api.deleteDay).toHaveBeenCalledWith('d2');
  });
});
