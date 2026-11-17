import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listMealCategories: vi.fn(), addMealCategory: vi.fn(), renameMealCategory: vi.fn(), deleteMealCategory: vi.fn(), reorderMealCategories: vi.fn(),
}));
vi.mock('./api', () => api);

import { MealCategoriesPage } from './MealCategoriesPage';

const LIST = [
  { id: 'g', name: 'High protein', sortOrder: 1, mealCount: 67 },
  { id: 'w', name: 'Western', sortOrder: 2, mealCount: 1 },
  { id: 's', name: 'Indian', sortOrder: 3, mealCount: 15 },
];

beforeEach(() => {
  api.listMealCategories.mockResolvedValue(LIST);
  for (const k of ['addMealCategory', 'renameMealCategory', 'deleteMealCategory', 'reorderMealCategories'] as const) api[k].mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('MealCategoriesPage', () => {
  it('lists categories with meal counts', async () => {
    render(<MealCategoriesPage />);
    await screen.findByText('Western');
    expect(within(row('High protein')).getByText('67 meals')).toBeTruthy();
    expect(within(row('Western')).getByText('1 meal')).toBeTruthy();
  });

  it('adds a category at the end of the order', async () => {
    render(<MealCategoriesPage />);
    await userEvent.type(await screen.findByLabelText('New category name'), 'Vegetarian');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect(api.addMealCategory).toHaveBeenCalledWith('Vegetarian', 4);
  });

  it('rejects a duplicate name without calling the server', async () => {
    render(<MealCategoriesPage />);
    await userEvent.type(await screen.findByLabelText('New category name'), 'western');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already exists');
    expect(api.addMealCategory).not.toHaveBeenCalled();
  });

  it('renames a category', async () => {
    render(<MealCategoriesPage />);
    await userEvent.click(within((await screen.findByText('Western')).closest('li')!).getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename Western');
    await userEvent.clear(input);
    await userEvent.type(input, 'Western food');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.renameMealCategory).toHaveBeenCalledWith('w', 'Western food');
  });

  it('reorders by swapping with the neighbour; the ends cannot move outwards', async () => {
    render(<MealCategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Move Indian up' }));
    expect(api.reorderMealCategories).toHaveBeenCalledWith(['g', 's', 'w']);
    expect((screen.getByRole('button', { name: 'Move High protein up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move Indian down' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('deletes only after confirmation, and says the meals are kept', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MealCategoriesPage />);
    const south = (await screen.findByText('Indian')).closest('li')!;
    await userEvent.click(within(south).getByRole('button', { name: 'Delete' }));
    expect(api.deleteMealCategory).not.toHaveBeenCalled();
    await userEvent.click(within(south).getByRole('button', { name: 'Delete' }));
    expect(confirm.mock.calls[0][0]).toContain('removed from its 15 meals; the meals are kept');
    expect(api.deleteMealCategory).toHaveBeenCalledWith('s');
  });

  it('shows the server error and keeps the list when a change fails', async () => {
    api.deleteMealCategory.mockRejectedValue(new Error('Could not delete: nope'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MealCategoriesPage />);
    await userEvent.click(within((await screen.findByText('Western')).closest('li')!).getByRole('button', { name: 'Delete' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not delete: nope');
    expect(screen.getByText('Western')).toBeTruthy();
  });

  it('has an empty state', async () => {
    api.listMealCategories.mockResolvedValue([]);
    render(<MealCategoriesPage />);
    expect(await screen.findByText('No categories yet')).toBeTruthy();
  });
});
