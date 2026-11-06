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

  it('asks for the piece sizes too', async () => {
    sb.select.mockResolvedValue({ data: [row], error: null });
    await listFoods();
    expect(sb.select.mock.calls[0][0]).toContain('piece_name, piece_amount');
  });

  it('still loads foods, without piece sizes, when migration 0010 has not been run', async () => {
    sb.select
      .mockResolvedValueOnce({ data: null, error: { message: 'column food_variants_1.piece_name does not exist' } })
      .mockResolvedValueOnce({ data: [row], error: null });
    const foods = await listFoods();
    expect(foods.map((f) => f.name)).toEqual(['Apple']);
    expect(sb.select.mock.calls[1][0]).toContain('food_world_areas');
    expect(sb.select.mock.calls[1][0]).not.toContain('piece_name');
  });

  it('copes with both migrations missing', async () => {
    sb.select
      .mockResolvedValueOnce({ data: null, error: { message: "relationship between 'foods' and 'food_world_areas' in the schema cache" } })
      .mockResolvedValueOnce({ data: null, error: { message: 'column food_variants.piece_amount does not exist' } })
      .mockResolvedValueOnce({ data: [row], error: null });
    const foods = await listFoods();
    expect(foods).toHaveLength(1);
    const last = sb.select.mock.calls[2][0];
    expect(last).not.toContain('food_world_areas');
    expect(last).not.toContain('piece_');
  });

  it('does not hide other errors', async () => {
    sb.select.mockResolvedValue({ data: null, error: { message: 'permission denied for table foods' } });
    await expect(listFoods()).rejects.toThrow('Could not load foods: permission denied');
  });
});
