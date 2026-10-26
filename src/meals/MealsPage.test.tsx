import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '../foods/model';
import type { Meal } from './model';

const mealsApi = vi.hoisted(() => ({
  listMeals: vi.fn(), saveMeal: vi.fn(), setMealPublished: vi.fn(), deleteMeal: vi.fn(),
}));
const foodsApi = vi.hoisted(() => ({ listFoods: vi.fn() }));
vi.mock('./api', () => mealsApi);
vi.mock('../foods/api', () => foodsApi);

import { MealsPage } from './MealsPage';

const v = (id: string, name: string, calories: number, proteinG: number) => ({
  id, name, basisAmount: 100, basisUnit: 'GRAM' as const, calories, proteinG, carbsG: 0, fatG: 0,
});
const FOODS: Food[] = [
  { id: 'c', name: 'Chicken breast', category: 'MEAT_AND_POULTRY', published: true, variants: [v('c1', 'Grilled', 165, 31), v('c2', 'Fried', 250, 27)] },
  { id: 'r', name: 'White rice', category: 'GRAINS_AND_BREAD', published: false, variants: [v('r1', 'Cooked', 130, 2.7)] },
];
const MEALS: Meal[] = [
  { id: 'm1', name: 'Chicken bowl', tag: 'High protein', accent: 'GREEN', published: false, items: [{ variantId: 'c1', amount: 200 }, { variantId: 'r1', amount: 100 }] },
];

beforeEach(() => {
  foodsApi.listFoods.mockResolvedValue(FOODS);
  mealsApi.listMeals.mockResolvedValue(MEALS);
  mealsApi.saveMeal.mockResolvedValue(undefined);
  mealsApi.setMealPublished.mockResolvedValue(undefined);
  mealsApi.deleteMeal.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('MealsPage', () => {
  it('lists meals with items and totals computed from the foods', async () => {
    render(<MealsPage />);
    expect(await screen.findByText('Chicken bowl')).toBeTruthy();
    expect(screen.getByText('Chicken breast (Grilled) · 200 g')).toBeTruthy();
    expect(screen.getByText('460 kcal · P 64.7 g · C 0 g · F 0 g')).toBeTruthy();
  });

  it('refuses to publish a meal that uses a draft food', async () => {
    render(<MealsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Publish these foods first: White rice.');
    expect(mealsApi.setMealPublished).not.toHaveBeenCalled();
  });

  it('shows an empty state and a retryable error', async () => {
    mealsApi.listMeals.mockResolvedValueOnce([]);
    render(<MealsPage />);
    expect(await screen.findByText('No meals yet')).toBeTruthy();
    cleanup();
    mealsApi.listMeals.mockRejectedValueOnce(new Error('Could not load meals: boom'));
    render(<MealsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not load meals: boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Chicken bowl')).toBeTruthy();
  });
});

describe('MealEditor', () => {
  it('builds a meal by searching foods, shows live totals, and saves the payload', async () => {
    render(<MealsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add meal' }));
    await userEvent.type(screen.getByLabelText('Meal name'), 'Lunch');
    await userEvent.type(screen.getByLabelText('Add a food'), 'chick');
    await userEvent.click(screen.getByRole('button', { name: /Chicken breast/ }));

    await userEvent.selectOptions(screen.getByLabelText('Preparation'), 'c2');
    const amount = screen.getByLabelText('Amount (g)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '150');
    expect(screen.getByText('Total: 375 kcal · P 40.5 g · C 0 g · F 0 g')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mealsApi.saveMeal).toHaveBeenCalledWith({
      id: null, name: 'Lunch', tag: '', accent: 'GREEN', published: false,
      items: [{ food_variant_id: 'c2', amount: 150 }],
    });
    expect(mealsApi.listMeals).toHaveBeenCalledTimes(2); // reloaded
  });

  it('blocks saving with no foods and explains why', async () => {
    render(<MealsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add meal' }));
    await userEvent.type(screen.getByLabelText('Meal name'), 'Empty');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toContain('Add at least one food.');
    expect(mealsApi.saveMeal).not.toHaveBeenCalled();
  });

  it('warns about draft foods when Published is ticked', async () => {
    render(<MealsPage />);
    const card = (await screen.findByText('Chicken bowl')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByLabelText('Published (visible in the app)'));
    expect(screen.getByRole('note').textContent).toContain('White rice');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mealsApi.saveMeal).not.toHaveBeenCalled();
  });

  it('shows the server error and stays open when saving fails', async () => {
    mealsApi.saveMeal.mockRejectedValue(new Error('Could not save: nope'));
    render(<MealsPage />);
    const card = (await screen.findByText('Chicken bowl')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('nope');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('deletes only after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MealsPage />);
    const card = (await screen.findByText('Chicken bowl')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete meal' }));
    expect(mealsApi.deleteMeal).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete meal' }));
    expect(mealsApi.deleteMeal).toHaveBeenCalledWith('m1');
  });
});
