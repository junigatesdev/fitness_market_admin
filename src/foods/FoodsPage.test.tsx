import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from './model';

const api = vi.hoisted(() => ({
  listFoods: vi.fn(),
  saveFood: vi.fn(),
  setPublished: vi.fn(),
  deleteFood: vi.fn(),
}));
vi.mock('./api', () => api);

import { FoodsPage } from './FoodsPage';

const variant = (id: string, name: string, calories: number) => ({
  id, name, basisAmount: 100, basisUnit: 'GRAM' as const, calories, proteinG: 0, carbsG: 0, fatG: 0,
});
const FOODS: Food[] = [
  { id: 'c', name: 'Corn', category: 'VEGETABLE', published: true, variants: [variant('c1', 'Boiled', 96)] },
  { id: 'p', name: 'Chicken breast', category: 'MEAT_AND_POULTRY', published: false, variants: [variant('p1', 'Fried', 220), variant('p2', 'Raw', 120)] },
];

beforeEach(() => {
  api.listFoods.mockResolvedValue(FOODS);
  api.saveFood.mockResolvedValue(undefined);
  api.setPublished.mockResolvedValue(undefined);
  api.deleteFood.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('FoodsPage list', () => {
  it('lists foods with their preparations and status', async () => {
    render(<FoodsPage />);
    expect(await screen.findByText('Corn')).toBeTruthy();
    expect(screen.getByText('Fried: 220 kcal per 100 g')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('filters by search and category', async () => {
    render(<FoodsPage />);
    await screen.findByText('Corn');
    await userEvent.type(screen.getByLabelText('Search foods'), 'chick');
    expect(screen.queryByText('Corn')).toBeNull();
    expect(screen.getByText('Chicken breast')).toBeTruthy();
    await userEvent.clear(screen.getByLabelText('Search foods'));
    await userEvent.selectOptions(screen.getByLabelText('Filter by category'), 'VEGETABLE');
    expect(screen.queryByText('Chicken breast')).toBeNull();
  });

  it('shows an empty state and a retryable error', async () => {
    api.listFoods.mockResolvedValueOnce([]);
    render(<FoodsPage />);
    expect(await screen.findByText('No foods yet')).toBeTruthy();
    cleanup();

    api.listFoods.mockRejectedValueOnce(new Error('Could not load foods: boom'));
    render(<FoodsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not load foods: boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Corn')).toBeTruthy();
  });

  it('publishes a draft', async () => {
    render(<FoodsPage />);
    const card = (await screen.findByText('Chicken breast')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Publish' }));
    expect(api.setPublished).toHaveBeenCalledWith('p', true);
  });
});

describe('FoodEditor', () => {
  it('blocks saving an invalid food and lists the problems', async () => {
    render(<FoodsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add food' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toContain('Food name is required.');
    expect(api.saveFood).not.toHaveBeenCalled();
  });

  it('saves a new food with two preparations', async () => {
    render(<FoodsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add food' }));
    await userEvent.type(screen.getByLabelText('Food name'), 'Potato');
    await userEvent.click(screen.getByRole('button', { name: '+ Add preparation' }));
    const names = screen.getAllByLabelText('Preparation');
    const cal = screen.getAllByLabelText('Calories (kcal)');
    const protein = screen.getAllByLabelText('Protein (g)');
    const carbs = screen.getAllByLabelText('Carbs (g)');
    const fat = screen.getAllByLabelText('Fat (g)');
    const rows = [['Raw', '77', '2', '17', '0.1'], ['Fried', '312', '3.4', '41', '15']];
    for (let i = 0; i < 2; i++) {
      await userEvent.type(names[i], rows[i][0]);
      await userEvent.type(cal[i], rows[i][1]);
      await userEvent.type(protein[i], rows[i][2]);
      await userEvent.type(carbs[i], rows[i][3]);
      await userEvent.type(fat[i], rows[i][4]);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saveFood).toHaveBeenCalledTimes(1);
    const payload = api.saveFood.mock.calls[0][0];
    expect(payload).toMatchObject({ id: null, name: 'Potato', published: false });
    expect(payload.variants).toHaveLength(2);
    expect(payload.variants[1]).toMatchObject({ name: 'Fried', calories: 312, fat_g: 15, basis_amount: 100 });
    expect(api.listFoods).toHaveBeenCalledTimes(2); // reloaded after save
  });

  it('shows the server error and stays open when saving fails', async () => {
    api.saveFood.mockRejectedValue(new Error('Could not save: permission denied'));
    render(<FoodsPage />);
    const card = (await screen.findByText('Corn')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('permission denied');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('warns when calories do not match the macros', async () => {
    render(<FoodsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add food' }));
    await userEvent.type(screen.getByLabelText('Calories (kcal)'), '500');
    await userEvent.type(screen.getByLabelText('Protein (g)'), '10');
    await userEvent.type(screen.getByLabelText('Carbs (g)'), '10');
    await userEvent.type(screen.getByLabelText('Fat (g)'), '1');
    expect(screen.getByRole('note').textContent).toContain('don’t match');
  });

  it('deletes only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<FoodsPage />);
    const card = (await screen.findByText('Corn')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete food' }));
    expect(api.deleteFood).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete food' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.deleteFood).toHaveBeenCalledWith('c');
  });
});
