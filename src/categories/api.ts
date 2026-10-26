import { supabase } from '../supabase';
import { Category, CategoryRow, fromRow, sortCategories } from './model';

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, sort_order, is_default, foods(count)')
    .returns<CategoryRow[]>();
  if (error) fail('Could not load categories', error);
  return sortCategories(data.map(fromRow));
}

/** Adds to the end of the list. */
export async function addCategory(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name: name.trim(), sort_order: sortOrder });
  if (error) fail('Could not add', error);
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id);
  if (error) fail('Could not rename', error);
}

/** Moves the category's foods to the default category, then deletes it (one transaction). */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_category', { p_id: id });
  if (error) fail('Could not delete', error);
}

export async function reorderCategories(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_categories', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
