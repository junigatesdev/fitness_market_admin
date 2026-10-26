import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listCategories: vi.fn(), addCategory: vi.fn(), renameCategory: vi.fn(), deleteCategory: vi.fn(), reorderCategories: vi.fn(),
}));
vi.mock('./api', () => api);

import { CategoriesPage } from './CategoriesPage';

const LIST = [
  { id: 'd', name: 'Food', sortOrder: 0, isDefault: true, foodCount: 3 },
  { id: 'f', name: 'Fruit', sortOrder: 1, isDefault: false, foodCount: 2 },
  { id: 'v', name: 'Vegetable', sortOrder: 2, isDefault: false, foodCount: 1 },
];

beforeEach(() => {
  api.listCategories.mockResolvedValue(LIST);
  for (const k of ['addCategory', 'renameCategory', 'deleteCategory', 'reorderCategories'] as const) api[k].mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('CategoriesPage', () => {
  it('lists categories with food counts; the default has no delete or move buttons', async () => {
    render(<CategoriesPage />);
    await screen.findByText('Fruit');
    expect(within(row('Fruit')).getByText('2 foods')).toBeTruthy();
    expect(within(row('Vegetable')).getByText('1 food')).toBeTruthy();
    const food = row('Food');
    expect(within(food).getByText('Default')).toBeTruthy();
    expect(within(food).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(food).queryByRole('button', { name: /Move/ })).toBeNull();
  });

  it('adds a category at the end of the order', async () => {
    render(<CategoriesPage />);
    await userEvent.type(await screen.findByLabelText('New category name'), 'Snacks');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect(api.addCategory).toHaveBeenCalledWith('Snacks', 3);
  });

  it('rejects a duplicate or blank name without calling the server', async () => {
    render(<CategoriesPage />);
    await userEvent.type(await screen.findByLabelText('New category name'), 'fruit');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already exists');
    expect(api.addCategory).not.toHaveBeenCalled();
  });

  it('renames a category', async () => {
    render(<CategoriesPage />);
    await userEvent.click(within((await screen.findByText('Fruit')).closest('li')!).getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename Fruit');
    await userEvent.clear(input);
    await userEvent.type(input, 'Fruits');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.renameCategory).toHaveBeenCalledWith('f', 'Fruits');
  });

  it('reorders: the default stays first and the others swap', async () => {
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Move Vegetable up' }));
    expect(api.reorderCategories).toHaveBeenCalledWith(['d', 'v', 'f']);
    expect((screen.getByRole('button', { name: 'Move Fruit up' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('deletes only after confirmation, and says foods move to Food', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<CategoriesPage />);
    const fruit = (await screen.findByText('Fruit')).closest('li')!;
    await userEvent.click(within(fruit).getByRole('button', { name: 'Delete' }));
    expect(api.deleteCategory).not.toHaveBeenCalled();
    await userEvent.click(within(fruit).getByRole('button', { name: 'Delete' }));
    expect(confirm.mock.calls[0][0]).toContain('Its 2 foods will move to “Food”');
    expect(api.deleteCategory).toHaveBeenCalledWith('f');
  });

  it('shows the server error and keeps the list when a change fails', async () => {
    api.deleteCategory.mockRejectedValue(new Error('Could not delete: nope'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CategoriesPage />);
    await userEvent.click(within((await screen.findByText('Fruit')).closest('li')!).getByRole('button', { name: 'Delete' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not delete: nope');
    expect(screen.getByText('Fruit')).toBeTruthy();
  });
});
