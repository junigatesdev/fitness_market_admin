import { supabase } from '../supabase';
import { Drink, DrinkRow, fromRow } from './model';

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function listDrinks(): Promise<Drink[]> {
  const { data, error } = await supabase
    .from('drinks')
    .select('*, drink_milks(food_variant_id, position)')
    .order('sort_order')
    .order('name')
    .returns<DrinkRow[]>();
  if (error) fail('Could not load drinks', error);
  return data.map(fromRow);
}

/** Creates or updates a drink and replaces its milk choices in one transaction (see 0009_drinks.sql). */
export async function saveDrink(payload: unknown): Promise<void> {
  const { error } = await supabase.rpc('save_drink', { p_drink: payload });
  if (error) fail('Could not save', error);
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('drinks').update({ published }).eq('id', id);
  if (error) fail('Could not update', error);
}

export async function deleteDrink(id: string): Promise<void> {
  const { error } = await supabase.from('drinks').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}

export async function reorderDrinks(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_drinks', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
