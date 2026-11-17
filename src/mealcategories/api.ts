import { supabase } from '../supabase';
import { MealCategory, MealCategoryRow, fromRow, sortCategories } from './model';

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

/** Throws when the tables don't exist yet (migration 0011 not run); callers treat that as "not set up". */
export async function listMealCategories(): Promise<MealCategory[]> {
  const { data, error } = await supabase
    .from('meal_categories')
    .select('id, name, sort_order, meal_category_links(count)')
    .returns<MealCategoryRow[]>();
  if (error) fail('Could not load meal categories', error);
  return sortCategories(data.map(fromRow));
}

/** Adds to the end of the list. */
export async function addMealCategory(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('meal_categories').insert({ name: name.trim(), sort_order: sortOrder });
  if (error) fail('Could not add', error);
}

export async function renameMealCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('meal_categories').update({ name: name.trim() }).eq('id', id);
  if (error) fail('Could not rename', error);
}

/** Removes the category and its tags from meals. The meals themselves are kept. */
export async function deleteMealCategory(id: string): Promise<void> {
  const { error } = await supabase.from('meal_categories').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}

export async function reorderMealCategories(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_meal_categories', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
