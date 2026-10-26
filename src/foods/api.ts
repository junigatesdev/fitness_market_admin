import { supabase } from '../supabase';
import { Food, FoodRow, fromRow } from './model';

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function listFoods(): Promise<Food[]> {
  const foods: Food[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('foods')
      .select('id, name, category, published, food_variants(id, name, basis_amount, basis_unit, calories, protein_g, carbs_g, fat_g)')
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
      .returns<FoodRow[]>();
    if (error) fail('Could not load foods', error);
    foods.push(...data.map(fromRow));
    if (data.length < PAGE) return foods;
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

export async function deleteFood(id: string): Promise<void> {
  const { error } = await supabase.from('foods').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}
