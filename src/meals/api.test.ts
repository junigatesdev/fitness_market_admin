import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => {
        const chain = { order: () => chain, range: () => chain, returns: () => sb.select(columns) };
        return chain;
      },
    }),
  },
}));

import { listMeals } from './api';

const row = { id: 'm1', name: 'Bowl', tag: '', accent: 'GREEN', published: true, meal_items: [] };

beforeEach(() => sb.select.mockReset());

describe('listMeals', () => {
  it('returns hot meals when the columns exist', async () => {
    sb.select.mockResolvedValue({ data: [{ ...row, is_hot: true, hot_order: 1 }], error: null });
    const result = await listMeals();
    expect(result.hotAvailable).toBe(true);
    expect(result.meals[0]).toMatchObject({ isHot: true, hotOrder: 1 });
  });

  it('still loads meals when the hot columns are missing', async () => {
    sb.select
      .mockResolvedValueOnce({ data: null, error: { message: 'column meals.is_hot does not exist' } })
      .mockResolvedValueOnce({ data: [row], error: null });
    const result = await listMeals();
    expect(result.hotAvailable).toBe(false);
    expect(result.meals.map((m) => m.name)).toEqual(['Bowl']);
    expect(sb.select.mock.calls[1][0]).not.toContain('is_hot');
  });

  it('reads each meal’s categories when the tables exist', async () => {
    sb.select.mockResolvedValue({ data: [{ ...row, is_hot: false, hot_order: 0, meal_category_links: [{ category_id: 'c1' }] }], error: null });
    const result = await listMeals();
    expect(result.categoriesAvailable).toBe(true);
    expect(result.meals[0].categoryIds).toEqual(['c1']);
    expect(sb.select.mock.calls[0][0]).toContain('meal_category_links(category_id)');
  });

  it('still loads meals when the category tables are missing (migration 0011 not run)', async () => {
    sb.select
      .mockResolvedValueOnce({ data: null, error: { message: "Could not find a relationship between 'meals' and 'meal_category_links' in the schema cache" } })
      .mockResolvedValueOnce({ data: [{ ...row, is_hot: true, hot_order: 1 }], error: null });
    const result = await listMeals();
    expect(result.categoriesAvailable).toBe(false);
    expect(result.hotAvailable).toBe(true);
    expect(result.meals[0].categoryIds).toEqual([]);
    expect(sb.select.mock.calls[1][0]).not.toContain('meal_category_links');
  });

  it('does not hide other errors', async () => {
    sb.select.mockResolvedValue({ data: null, error: { message: 'permission denied for table meals' } });
    await expect(listMeals()).rejects.toThrow('Could not load meals: permission denied');
  });
});
