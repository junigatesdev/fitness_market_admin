import { supabase } from '../supabase';
import { Food, FoodRow, fromRow } from './model';

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

const variantsSelect = (pieces: boolean) =>
  `food_variants(id, name, basis_amount, basis_unit, calories, protein_g, carbs_g, fat_g${pieces ? ', piece_name, piece_amount' : ''})`;
const selectFor = (areas: boolean, pieces: boolean) =>
  `id, name, category_id, published, ${areas ? 'food_world_areas(area_id), ' : ''}${variantsSelect(pieces)}`;

/** The world-area tables aren't in the database yet (migration 0005 not run), or its schema cache is stale. */
class AreaTablesMissing extends Error {}

/** The piece-size columns aren't in the database yet (migration 0010 not run), or the schema cache is stale. */
class PieceColumnsMissing extends Error {}

async function fetchAllFoods(select: string, detectMissingAreas: boolean, detectMissingPieces: boolean): Promise<Food[]> {
  const foods: Food[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('foods')
      .select(select)
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
      .returns<FoodRow[]>();
    if (error) {
      if (detectMissingAreas && error.message.includes('food_world_areas')) throw new AreaTablesMissing(error.message);
      if (detectMissingPieces && /piece_name|piece_amount/.test(error.message)) throw new PieceColumnsMissing(error.message);
      fail('Could not load foods', error);
    }
    foods.push(...data.map(fromRow));
    if (data.length < PAGE) return foods;
  }
}

/**
 * Foods with their world-area tags and piece sizes. If the area tables (0005) or the piece columns (0010) don't exist
 * yet, foods still load without them.
 */
export async function listFoods(): Promise<Food[]> {
  let areas = true;
  let pieces = true;
  for (;;) {
    try {
      return await fetchAllFoods(selectFor(areas, pieces), areas, pieces);
    } catch (e) {
      if (e instanceof AreaTablesMissing && areas) areas = false;
      else if (e instanceof PieceColumnsMissing && pieces) pieces = false;
      else throw e;
    }
  }
}

/** Creates or updates a food and its preparations in one transaction (see 0002_save_food.sql). */
export async function saveFood(payload: unknown): Promise<void> {
  const { error } = await supabase.rpc('save_food', { p_food: payload });
  if (error) fail('Could not save', error);
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('foods').update({ published }).eq('id', id);
  if (error) fail('Could not update', error);
}

/** Meals that use any preparation of this food. */
export async function mealsUsingFood(foodId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('meal_items')
    .select('meals(name), food_variants!inner(food_id)')
    .eq('food_variants.food_id', foodId)
    .returns<{ meals: { name: string } | null }[]>();
  if (error) fail('Could not check meals', error);
  return [...new Set(data.map((r) => r.meals?.name).filter((n): n is string => !!n))].sort();
}

/** Refuses (with the meal names) while any meal uses the food; the database enforces this too. */
export async function deleteFood(id: string): Promise<void> {
  const used = await mealsUsingFood(id);
  if (used.length > 0) {
    throw new Error(`Can't delete: used by these meals: ${used.join(', ')}. Remove it from those meals first.`);
  }
  const { error } = await supabase.from('foods').delete().eq('id', id);
  if (error) {
    fail(
      'Could not delete',
      error.message.includes('meal_items') ? { message: 'a meal still uses this food.' } : error,
    );
  }
}
