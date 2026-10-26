import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => {
        const chain = {
          order: () => chain,
          range: () => chain,
          returns: () => sb.select(columns),
        };
        return chain;
      },
    }),
  },
}));

import { listFoods } from './api';

const row = { id: 'f1', name: 'Apple', category_id: 'c', published: true, food_variants: [] };

beforeEach(() => sb.select.mockReset());

describe('listFoods', () => {
  it('returns foods with their area tags', async () => {
    sb.select.mockResolvedValue({ data: [{ ...row, food_world_areas: [{ area_id: 'a1' }] }], error: null });
    const foods = await listFoods();
    expect(foods[0].areaIds).toEqual(['a1']);
    expect(sb.select.mock.calls[0][0]).toContain('food_world_areas');
  });

  it('still loads foods, without tags, when the area tables are missing', async () => {
    sb.select
      .mockResolvedValueOnce({ data: null, error: { message: "Could not find a relationship between 'foods' and 'food_world_areas' in the schema cache" } })
      .mockResolvedValueOnce({ data: [row], error: null });
    const foods = await listFoods();
    expect(foods.map((f) => f.name)).toEqual(['Apple']);
    expect(foods[0].areaIds).toEqual([]);
    expect(sb.select.mock.calls[1][0]).not.toContain('food_world_areas');
  });

  it('does not hide other errors', async () => {
    sb.select.mockResolvedValue({ data: null, error: { message: 'permission denied for table foods' } });
    await expect(listFoods()).rejects.toThrow('Could not load foods: permission denied');
  });
});
