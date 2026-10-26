import { describe, expect, it } from 'vitest';
import { Category, CategoryRow, fromRow, moveItem, sortCategories, validateCategoryName } from './model';

const cat = (id: string, name: string, sortOrder: number, isDefault = false): Category => ({ id, name, sortOrder, isDefault, foodCount: 0 });

describe('validateCategoryName', () => {
  it('accepts a new name', () => expect(validateCategoryName('Fruits', ['Food'])).toBeNull());
  it('rejects blank, too long and duplicate (case-insensitive) names', () => {
    expect(validateCategoryName('  ', [])).toContain('required');
    expect(validateCategoryName('x'.repeat(61), [])).toContain('at most 60');
    expect(validateCategoryName(' fruits ', ['Fruits'])).toContain('already exists');
  });
});

describe('sortCategories / moveItem', () => {
  it('puts the default first, then saved order', () => {
    const sorted = sortCategories([cat('b', 'Veg', 2), cat('d', 'Food', 5, true), cat('a', 'Fruit', 1)]);
    expect(sorted.map((c) => c.id)).toEqual(['d', 'a', 'b']);
  });
  it('moves one step and stops at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('fromRow', () => {
  it('reads the food count from the embedded aggregate', () => {
    const row: CategoryRow = { id: 'a', name: 'Fruit', sort_order: 1, is_default: false, foods: [{ count: 12 }] };
    expect(fromRow(row)).toEqual({ id: 'a', name: 'Fruit', sortOrder: 1, isDefault: false, foodCount: 12 });
    expect(fromRow({ ...row, foods: [] }).foodCount).toBe(0);
  });
});
