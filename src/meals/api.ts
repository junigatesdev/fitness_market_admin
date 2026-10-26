import { supabase } from '../supabase';
import { Meal, MealRow, fromRow } from './model';

const PAGE = 1000;

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function listMeals(): Promise<Meal[]> {
  const meals: Meal[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('meals')
      .select('id, name, tag, accent, published, meal_items(food_variant_id, amount, position)')
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
      .returns<MealRow[]>();
    if (error) fail('Could not load meals', error);
    meals.push(...data.map(fromRow));
    if (data.length < PAGE) return meals;
  }
}

/** Creates or updates a meal and its items in one transaction (see 0003_meals.sql). */
export async function saveMeal(payload: unknown): Promise<void> {
  const { error } = await supabase.rpc('save_meal', { p_meal: payload });
  if (error) fail('Could not save', error);
}

export async function setMealPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('meals').update({ published }).eq('id', id);
  if (error) fail('Could not update', error);
}

export async function deleteMeal(id: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}
