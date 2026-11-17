import { describe, expect, it } from 'vitest';
import { MealCategory, MealCategoryRow, fromRow, sortCategories, validateCategoryName } from './model';

describe('validateCategoryName', () => {
  it('accepts a new name', () => expect(validateCategoryName('Vegetarian', ['Indian'])).toBeNull());
  it('rejects blank, too long and duplicate (case-insensitive) names', () => {
    expect(validateCategoryName('  ', [])).toContain('required');
    expect(validateCategoryName('x'.repeat(61), [])).toContain('at most 60');
    expect(validateCategoryName(' indian ', ['Indian'])).toContain('already exists');
  });
});

describe('meal categories', () => {
  it('sorts by saved order, then name', () => {
    const a = (id: string, name: string, sortOrder: number): MealCategory => ({ id, name, sortOrder, mealCount: 0 });
    expect(sortCategories([a('3', 'B', 2), a('1', 'Z', 1), a('2', 'A', 2)]).map((x) => x.id)).toEqual(['1', '2', '3']);
  });
  it('reads the meal count from the embedded aggregate', () => {
    const row: MealCategoryRow = { id: 'a', name: 'Indian', sort_order: 1, meal_category_links: [{ count: 19 }] };
    expect(fromRow(row)).toEqual({ id: 'a', name: 'Indian', sortOrder: 1, mealCount: 19 });
    expect(fromRow({ ...row, meal_category_links: [] }).mealCount).toBe(0);
  });
});
