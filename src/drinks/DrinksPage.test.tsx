import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Drink } from './model';

const api = vi.hoisted(() => ({ listDrinks: vi.fn(), saveDrink: vi.fn(), setPublished: vi.fn(), deleteDrink: vi.fn(), reorderDrinks: vi.fn() }));
const foodsApi = vi.hoisted(() => ({ listFoods: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('../foods/api', () => foodsApi);

import { DrinksPage } from './DrinksPage';

const variant = (id: string, name: string, unit: 'GRAM' | 'MILLILITER') => ({ id, name, basisAmount: 100, basisUnit: unit, calories: 60, proteinG: 3, carbsG: 5, fatG: 3 });
const FOODS = [
  { id: 'f-milk', name: 'Milk (whole)', categoryId: 'c', areaIds: [], published: true, variants: [variant('v-milk', 'Plain', 'MILLILITER')] },
  { id: 'f-skim', name: 'Milk (skimmed)', categoryId: 'c', areaIds: [], published: false, variants: [variant('v-skim', 'Plain', 'MILLILITER')] },
  { id: 'f-sugar', name: 'Sugar', categoryId: 'c', areaIds: [], published: true, variants: [variant('v-sugar', 'White', 'GRAM')] },
  { id: 'f-rice', name: 'Rice', categoryId: 'c', areaIds: [], published: true, variants: [variant('v-rice', 'Boiled', 'GRAM')] },
];
const DRINKS: Drink[] = [
  { id: 'd1', name: 'Chay / Milk tea', sortOrder: 1, published: true, cupMl: 250, baseKcalPer100ml: 1, asksMilk: true, milkDefaultMl: 100,
    milkQuickMl: [50, 100], asksSugar: true, sugarVariantId: 'v-sugar', sugarDefaultTsp: 2, tspGrams: 4, asksOther: true, milkVariantIds: ['v-milk'] },
  { id: 'd2', name: 'Black tea', sortOrder: 2, published: false, cupMl: 250, baseKcalPer100ml: 1, asksMilk: false, milkDefaultMl: 0,
    milkQuickMl: [], asksSugar: true, sugarVariantId: 'v-sugar', sugarDefaultTsp: 1, tspGrams: 4, asksOther: false, milkVariantIds: [] },
];

beforeEach(() => {
  api.listDrinks.mockResolvedValue(DRINKS);
  foodsApi.listFoods.mockResolvedValue(FOODS);
  for (const k of ['saveDrink', 'setPublished', 'deleteDrink', 'reorderDrinks'] as const) api[k].mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const card = (name: string) => screen.getByText(name).closest('li')!;

describe('DrinksPage list', () => {
  it('lists drinks with what they ask and their status', async () => {
    render(<DrinksPage />);
    await screen.findByText('Chay / Milk tea');
    expect(within(card('Chay / Milk tea')).getByText('250 ml · asks milk, sugar, other')).toBeTruthy();
    expect(within(card('Chay / Milk tea')).getByText('Published')).toBeTruthy();
    expect(within(card('Black tea')).getByText('Draft')).toBeTruthy();
    expect(screen.getByText('2 drinks · 1 published')).toBeTruthy();
  });

  it('publishes and reorders', async () => {
    render(<DrinksPage />);
    await screen.findByText('Black tea');
    await userEvent.click(within(card('Black tea')).getByRole('button', { name: 'Publish' }));
    expect(api.setPublished).toHaveBeenCalledWith('d2', true);
    await userEvent.click(within(card('Black tea')).getByRole('button', { name: 'Move Black tea up' }));
    expect(api.reorderDrinks).toHaveBeenCalledWith(['d2', 'd1']);
  });

  it('explains what to run when the tables are missing', async () => {
    api.listDrinks.mockRejectedValue(new Error('Could not load drinks: relation "public.drinks" does not exist'));
    render(<DrinksPage />);
    expect(await screen.findByText(/0009_drinks\.sql/)).toBeTruthy();
  });
});

describe('DrinkEditor', () => {
  it('offers only ml foods as milk and gram foods as sugar, and saves the payload', async () => {
    render(<DrinksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New drink' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Masala chai');
    expect(screen.queryByLabelText(/Rice/)).toBeNull();
    await userEvent.click(screen.getByLabelText(/Milk \(whole\) · Plain/));
    await userEvent.selectOptions(screen.getByLabelText(/Sugar food/), 'v-sugar');
    await userEvent.click(screen.getByRole('button', { name: 'Save drink' }));
    expect(api.saveDrink).toHaveBeenCalledTimes(1);
    expect(api.saveDrink.mock.calls[0][0]).toMatchObject({
      name: 'Masala chai', cup_ml: 250, milk_variant_ids: ['v-milk'], sugar_variant_id: 'v-sugar', published: false,
    });
  });

  it('shows what is missing instead of saving', async () => {
    render(<DrinksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New drink' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save drink' }));
    expect(await screen.findByText('Drink name is required.')).toBeTruthy();
    expect(api.saveDrink).not.toHaveBeenCalled();
  });

  it('warns when a picked food is still a draft', async () => {
    render(<DrinksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New drink' }));
    await userEvent.click(screen.getByLabelText(/Milk \(skimmed\) · Plain/));
    expect(screen.getByText(/still a draft/)).toBeTruthy();
  });

  it('deletes after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DrinksPage />);
    await userEvent.click(within(await screen.findByText('Black tea').then(() => card('Black tea'))).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(api.deleteDrink).toHaveBeenCalledWith('d2');
  });
});
