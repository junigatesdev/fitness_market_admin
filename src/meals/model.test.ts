import { describe, expect, it } from 'vitest';
import { Food } from '../foods/model';
import { MealDraft, MealRow, blankMeal, draftFoodNames, fromRow, newItem, toDraft, toPayload, validateMeal } from './model';
import { formatTotals, indexVariants, scale, sumItems } from './nutrition';

const chicken: Food = {
  id: 'f1', name: 'Chicken breast', categoryId: 'cat-food', areaIds: [], published: true,
  variants: [
    { id: 'v1', name: 'Grilled', basisAmount: 100, basisUnit: 'GRAM', calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    { id: 'v2', name: 'Fried', basisAmount: 100, basisUnit: 'GRAM', calories: 250, proteinG: 27, carbsG: 8, fatG: 12 },
  ],
};
const rice: Food = {
  id: 'f2', name: 'White rice', categoryId: 'cat-food', areaIds: [], published: false,
  variants: [{ id: 'v3', name: 'Cooked', basisAmount: 100, basisUnit: 'GRAM', calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }],
};
const egg: Food = {
  id: 'f3', name: 'Egg', categoryId: 'cat-food', areaIds: [], published: true,
  variants: [{ id: 'v4', name: 'Boiled', basisAmount: 1, basisUnit: 'PIECE', calories: 78, proteinG: 6, carbsG: 0.6, fatG: 5 }],
};
const index = indexVariants([chicken, rice, egg]);

const draftWith = (items: [string, string][], over: Partial<MealDraft> = {}): MealDraft => ({
  ...blankMeal(), name: 'Bowl', items: items.map(([variantId, amount], i) => ({ key: `k${i}`, variantId, amount })), ...over,
});

describe('nutrition', () => {
  it('scales by amount over the basis', () => {
    expect(scale(chicken.variants[0], 150)).toMatchObject({ calories: 247.5, proteinG: 46.5 });
    expect(scale(egg.variants[0], 2).calories).toBe(156);
  });

  it('sums items from the foods’ current values, skipping unknown or invalid ones', () => {
    const t = sumItems(
      [{ variantId: 'v1', amount: 150 }, { variantId: 'v3', amount: 200 }, { variantId: 'gone', amount: 50 }, { variantId: 'v4', amount: NaN }],
      index,
    );
    expect(t.calories).toBeCloseTo(247.5 + 260);
    expect(formatTotals(t)).toBe('508 kcal · P 51.9 g · C 56 g · F 6 g');
  });

  it('follows food edits: change the food, the meal total changes', () => {
    const items = [{ variantId: 'v1', amount: 100 }];
    const before = sumItems(items, index).calories;
    const edited = { ...chicken, variants: [{ ...chicken.variants[0], calories: 200 }, chicken.variants[1]] };
    expect(sumItems(items, indexVariants([edited])).calories).toBe(200);
    expect(before).toBe(165);
  });
});

describe('validateMeal', () => {
  it('accepts a valid meal', () => expect(validateMeal(draftWith([['v1', '150']]), index)).toEqual([]));

  it('requires a name and at least one food', () => {
    const errors = validateMeal(blankMeal(), index).join('\n');
    expect(errors).toContain('Meal name is required.');
    expect(errors).toContain('Add at least one food.');
  });

  it('rejects bad amounts, duplicates and missing foods', () => {
    const errors = validateMeal(draftWith([['v1', '0'], ['v1', '5'], ['gone', '5']]), index).join('\n');
    expect(errors).toContain('amount must be greater than 0');
    expect(errors).toContain('added twice');
    expect(errors).toContain('no longer exists');
  });

  it('blocks publishing a meal that uses draft foods, but allows saving it as a draft', () => {
    const items: [string, string][] = [['v1', '100'], ['v3', '100']];
    expect(validateMeal(draftWith(items, { published: true }), index).join()).toContain('White rice');
    expect(draftFoodNames(draftWith(items).items, index)).toEqual(['White rice']);
    expect(validateMeal(draftWith(items), index)).toEqual([]);
  });
});

describe('payload and mapping', () => {
  it('builds the save_meal payload', () => {
    const d = draftWith([['v1', '150'], ['v4', '2']], { name: ' Bowl ', tag: ' High protein ', id: 'm1' });
    expect(toPayload(d)).toEqual({
      id: 'm1', name: 'Bowl', tag: 'High protein', accent: 'GREEN', published: false,
      items: [{ food_variant_id: 'v1', amount: 150 }, { food_variant_id: 'v4', amount: 2 }],
    });
  });

  it('keeps item order from position, and starts new items at the basis amount', () => {
    const row: MealRow = {
      id: 'm1', name: 'Bowl', tag: '', accent: 'OCEAN', published: true,
      meal_items: [{ food_variant_id: 'v3', amount: 200, position: 2 }, { food_variant_id: 'v1', amount: 150, position: 1 }],
    };
    const meal = fromRow(row);
    expect(meal.items.map((i) => i.variantId)).toEqual(['v1', 'v3']);
    expect(toDraft(meal).items.map((i) => i.amount)).toEqual(['150', '200']);
    expect(newItem({ food: egg, variant: egg.variants[0] }).amount).toBe('1');
  });
});
