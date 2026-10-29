import { supabase } from '../supabase';
import {
  Exercise, ExerciseRow, ExerciseTag, ExerciseTagRow, MuscleGroup, MuscleGroupRow,
  fromRow, groupFromRow, sortGroups, sortTags, tagFromRow,
} from './model';

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

const EXERCISE_COLUMNS =
  'id, name, muscle_group_id, equipment, difficulty, instructions, measure, default_sets, default_target, uses_weight, published, exercise_tag_links(tag_id)';

export async function listExercises(): Promise<Exercise[]> {
  const exercises: Exercise[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('exercises')
      .select(EXERCISE_COLUMNS)
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
      .returns<ExerciseRow[]>();
    if (error) fail('Could not load exercises', error);
    exercises.push(...data.map(fromRow));
    if (data.length < PAGE) return exercises;
  }
}

export async function listMuscleGroups(): Promise<MuscleGroup[]> {
  const { data, error } = await supabase
    .from('muscle_groups')
    .select('id, name, sort_order, is_default, exercises(count)')
    .returns<MuscleGroupRow[]>();
  if (error) fail('Could not load muscle groups', error);
  return sortGroups(data.map(groupFromRow));
}

export async function listTags(): Promise<ExerciseTag[]> {
  const { data, error } = await supabase
    .from('exercise_tags')
    .select('id, name, sort_order, exercise_tag_links(count)')
    .returns<ExerciseTagRow[]>();
  if (error) fail('Could not load tags', error);
  return sortTags(data.map(tagFromRow));
}

/** Creates or updates an exercise and replaces its tags in one transaction (see 0007_exercises.sql). */
export async function saveExercise(payload: unknown): Promise<void> {
  const { error } = await supabase.rpc('save_exercise', { p_exercise: payload });
  if (error) fail('Could not save', error);
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('exercises').update({ published }).eq('id', id);
  if (error) fail('Could not update', error);
}

export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}

// ---- Muscle groups

export async function addMuscleGroup(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('muscle_groups').insert({ name: name.trim(), sort_order: sortOrder });
  if (error) fail('Could not add', error);
}

export async function renameMuscleGroup(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('muscle_groups').update({ name: name.trim() }).eq('id', id);
  if (error) fail('Could not rename', error);
}

/** Moves the group's exercises to the default group, then deletes it (one transaction). */
export async function deleteMuscleGroup(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_muscle_group', { p_id: id });
  if (error) fail('Could not delete', error);
}

export async function reorderMuscleGroups(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_muscle_groups', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}

// ---- Tags

export async function addTag(name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('exercise_tags').insert({ name: name.trim(), sort_order: sortOrder });
  if (error) fail('Could not add', error);
}

export async function renameTag(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('exercise_tags').update({ name: name.trim() }).eq('id', id);
  if (error) fail('Could not rename', error);
}

/** Only removes the tag from its exercises; the exercises stay. */
export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from('exercise_tags').delete().eq('id', id);
  if (error) fail('Could not delete', error);
}

export async function reorderTags(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_exercise_tags', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
