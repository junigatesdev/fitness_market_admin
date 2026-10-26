import { describe, expect, it } from 'vitest';
import { Area, AreaRow, fromRow, sortAreas, validateAreaName } from './model';

describe('validateAreaName', () => {
  it('accepts a new name', () => expect(validateAreaName('East Asian', ['Western'])).toBeNull());
  it('rejects blank, too long and duplicate (case-insensitive) names', () => {
    expect(validateAreaName('  ', [])).toContain('required');
    expect(validateAreaName('x'.repeat(61), [])).toContain('at most 60');
    expect(validateAreaName(' western ', ['Western'])).toContain('already exists');
  });
});

describe('areas', () => {
  it('sorts by saved order, then name', () => {
    const a = (id: string, name: string, sortOrder: number): Area => ({ id, name, sortOrder, foodCount: 0 });
    expect(sortAreas([a('3', 'B', 2), a('1', 'Z', 1), a('2', 'A', 2)]).map((x) => x.id)).toEqual(['1', '2', '3']);
  });
  it('reads the food count from the embedded aggregate', () => {
    const row: AreaRow = { id: 'a', name: 'Western', sort_order: 1, food_world_areas: [{ count: 19 }] };
    expect(fromRow(row)).toEqual({ id: 'a', name: 'Western', sortOrder: 1, foodCount: 19 });
    expect(fromRow({ ...row, food_world_areas: [] }).foodCount).toBe(0);
  });
});
