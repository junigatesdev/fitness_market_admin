import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '../foods/model';
import type { Meal } from './model';

const mealsApi = vi.hoisted(() => ({
  listMeals: vi.fn(), saveMeal: vi.fn(), setMealPublished: vi.fn(), deleteMeal: vi.fn(), setMealHot: vi.fn(), reorderHotMeals: vi.fn(),
}));
const foodsApi = vi.hoisted(() => ({ listFoods: vi.fn() }));
vi.mock('./api', () => mealsApi);
vi.mock('../foods/api', () => foodsApi);

import { MealsPage } from './MealsPage';

const v = (id: string, name: string, calories: number, proteinG: number) => ({
  id, name, basisAmount: 100, basisUnit: 'GRAM' as const, calories, proteinG, carbsG: 0, fatG: 0,
});
const FOODS: Food[] = [
  { id: 'c', name: 'Chicken breast', categoryId: 'cat-food', areaIds: [], published: true, variants: [v('c1', 'Grilled', 165, 31), v('c2', 'Fried', 250, 27)] },
  { id: 'r', name: 'White rice', categoryId: 'cat-food', areaIds: [], published: false, variants: [v('r1', 'Cooked', 130, 2.7)] },
];
const MEALS: Meal[] = [
  { id: 'm1', name: 'Chicken bowl', tag: 'High protein', accent: 'GREEN', published: false, isHot: false, hotOrder: 0, items: [{ variantId: 'c1', amount: 200 }, { variantId: 'r1', amount: 100 }] },
];

beforeEach(() => {
  foodsApi.listFoods.mockResolvedValue(FOODS);
  mealsApi.listMeals.mockResolvedValue({ meals: MEALS, hotAvailable: true });
  mealsApi.saveMeal.mockResolvedValue(undefined);
  mealsApi.setMealPublished.mockResolvedValue(undefined);
  mealsApi.deleteMeal.mockResolvedValue(undefined);
  mealsApi.setMealHot.mockResolvedValue(undefined);
  mealsApi.reorderHotMeals.mockResolvedValue(undefined);
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
    mealsApi.listMeals.mockResolvedValueOnce({ meals: [], hotAvailable: true });
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

describe('hot meals', () => {
  const HOT: Meal[] = [
    { id: 'a', name: 'Alpha', tag: '', accent: 'GREEN', published: true, isHot: true, hotOrder: 1, items: [{ variantId: 'c1', amount: 100 }] },
    { id: 'b', name: 'Bravo', tag: '', accent: 'OCEAN', published: true, isHot: true, hotOrder: 2, items: [{ variantId: 'c1', amount: 100 }] },
    { id: 'c', name: 'Charlie', tag: '', accent: 'BLUE', published: true, isHot: false, hotOrder: 0, items: [{ variantId: 'c1', amount: 100 }] },
    { id: 'd', name: 'Delta (draft)', tag: '', accent: 'BLUE', published: false, isHot: false, hotOrder: 0, items: [{ variantId: 'c1', amount: 100 }] },
  ];
  beforeEach(() => {
    mealsApi.listMeals.mockResolvedValue({ meals: HOT, hotAvailable: true });
  });

  it('marks hot meals and offers Make hot only for published meals', async () => {
    render(<MealsPage />);
    expect(await screen.findByText('Hot #1')).toBeTruthy();
    expect(within(screen.getByText('Charlie').closest('li')!).getByRole('button', { name: 'Make hot' })).toBeTruthy();
    expect(within(screen.getByText('Delta (draft)').closest('li')!).queryByRole('button', { name: 'Make hot' })).toBeNull();
    expect(within(screen.getByText('Alpha').closest('li')!).getByRole('button', { name: 'Remove from hot' })).toBeTruthy();
  });

  it('makes a meal hot at the end of the list, and removes one from it', async () => {
    render(<MealsPage />);
    await userEvent.click(within((await screen.findByText('Charlie')).closest('li')!).getByRole('button', { name: 'Make hot' }));
    expect(mealsApi.setMealHot).toHaveBeenCalledWith('c', true, 3);
    await waitFor(() => expect(mealsApi.listMeals).toHaveBeenCalledTimes(2)); // reloaded
    await userEvent.click(within(screen.getByText('Alpha').closest('li')!).getByRole('button', { name: 'Remove from hot' }));
    expect(mealsApi.setMealHot).toHaveBeenCalledWith('a', false, 3);
    await waitFor(() => expect(mealsApi.listMeals).toHaveBeenCalledTimes(3));
  });

  it('the Hot view shows only hot meals and reorders them', async () => {
    render(<MealsPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Show meals'), 'hot');
    expect(screen.queryByText('Charlie')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Move Bravo earlier' }));
    expect(mealsApi.reorderHotMeals).toHaveBeenCalledWith(['b', 'a']);
    await waitFor(() => expect(mealsApi.listMeals).toHaveBeenCalledTimes(2)); // reloaded
    expect((screen.getByRole('button', { name: 'Move Alpha earlier' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move Bravo later' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('still lists meals, with a notice and no Hot option, when the database lacks the hot columns', async () => {
    mealsApi.listMeals.mockResolvedValue({ meals: HOT.map((m) => ({ ...m, isHot: false, hotOrder: 0 })), hotAvailable: false });
    render(<MealsPage />);
    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('0006_hot_meals.sql');
    expect(screen.queryByLabelText('Show meals')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make hot' })).toBeNull();
  });

  it('the editor sends the hot flag, and Hot needs Published', async () => {
    render(<MealsPage />);
    const card = (await screen.findByText('Charlie')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByLabelText(/Hot on Home/));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mealsApi.saveMeal.mock.calls[0][0]).toMatchObject({ id: 'c', published: true, is_hot: true });
    await waitFor(() => expect(mealsApi.listMeals).toHaveBeenCalledTimes(2)); // reloaded after saving
  });

  it('unticking Published also unticks Hot, and a draft cannot be hot', async () => {
    render(<MealsPage />);
    const card = (await screen.findByText('Alpha')).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    const hot = screen.getByLabelText(/Hot on Home/) as HTMLInputElement;
    expect(hot.checked).toBe(true);
    await userEvent.click(screen.getByLabelText(/Published \(visible/));
    expect(hot.checked).toBe(false);
    expect(hot.disabled).toBe(true);
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
      id: null, name: 'Lunch', tag: '', accent: 'GREEN', published: false, is_hot: false,
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
