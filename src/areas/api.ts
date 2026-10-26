import { supabase } from '../supabase';
import { Area, AreaRow, fromRow, sortAreas } from './model';

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function listAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from('world_areas')
    .select('id, name, sort_order, food_world_areas(count)')
    .returns<AreaRow[]>();
  if (error) fail('Could not load world areas', error);
  return sortAreas(data.map(fromRow));
}

/** Adds to the end of the list. */
export async function addArea(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('world_areas').insert({ name: name.trim(), sort_order: sortOrder });
  if (error) fail('Could not add', error);
}

export async function renameArea(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('world_areas').update({ name: name.trim() }).eq('id', id);
  if (error) fail('Could not rename', error);
}

/** Removes the area and its tags from foods. The foods themselves are kept. */
export async function deleteArea(id: string): Promise<void> {
  const { error } = await supabase.from('world_areas').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}

export async function reorderAreas(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_world_areas', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
