import { supabase } from '../supabase';
import { DefaultDay, DefaultDayRow, fromRow } from './model';

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function listDays(): Promise<DefaultDay[]> {
  const { data, error } = await supabase
    .from('default_days')
    .select('id, name, sort_order, published, default_day_nodes(id, parent_id, position, name, exercise_id)')
    .order('sort_order')
    .order('name')
    .returns<DefaultDayRow[]>();
  if (error) fail('Could not load default days', error);
  return data.map(fromRow);
}

/** Creates or updates a day and replaces its whole tree in one transaction (see 0008_default_days.sql). */
export async function saveDay(payload: unknown): Promise<void> {
  const { error } = await supabase.rpc('save_default_day', { p_day: payload });
  if (error) fail('Could not save', error);
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('default_days').update({ published }).eq('id', id);
  if (error) fail('Could not update', error);
}

export async function deleteDay(id: string): Promise<void> {
  const { error } = await supabase.from('default_days').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}

export async function reorderDays(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_default_days', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
