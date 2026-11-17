import { supabase } from '../supabase';
import { Meal, MealRow, fromRow } from './model';

const PAGE = 1000;

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

const ITEMS = 'meal_items(food_variant_id, amount, position)';
const selectFor = (hot: boolean, categories: boolean) =>
  `id, name, tag, accent, published, ${hot ? 'is_hot, hot_order, ' : ''}${categories ? 'meal_category_links(category_id), ' : ''}${ITEMS}`;

/** The hot-meal columns don't exist yet (migration 0006 not run), or the API's schema cache is stale. */
class HotColumnsMissing extends Error {}

/** The meal-category tables don't exist yet (migration 0011 not run), or the API's schema cache is stale. */
class CategoryTablesMissing extends Error {}

async function fetchAllMeals(select: string, detectMissingHot: boolean, detectMissingCategories: boolean): Promise<Meal[]> {
  const meals: Meal[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('meals')
      .select(select)
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
      .returns<MealRow[]>();
    if (error) {
      if (detectMissingCategories && error.message.includes('meal_category_links')) throw new CategoryTablesMissing(error.message);
      if (detectMissingHot && /is_hot|hot_order/.test(error.message)) throw new HotColumnsMissing(error.message);
      fail('Could not load meals', error);
    }
    meals.push(...data.map(fromRow));
    if (data.length < PAGE) return meals;
  }
}

/**
 * All meals with their categories. `hotAvailable` is false when the database has no hot-meal columns (0006) and
 * `categoriesAvailable` is false when it has no meal-category tables (0011); meals still load either way.
 */
export async function listMeals(): Promise<{ meals: Meal[]; hotAvailable: boolean; categoriesAvailable: boolean }> {
  let hot = true;
  let categories = true;
  for (;;) {
    try {
      const meals = await fetchAllMeals(selectFor(hot, categories), hot, categories);
      return { meals, hotAvailable: hot, categoriesAvailable: categories };
    } catch (e) {
      if (e instanceof CategoryTablesMissing && categories) categories = false;
      else if (e instanceof HotColumnsMissing && hot) hot = false;
      else throw e;
    }
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

/** Makes a published meal hot (last in the hot list) or removes it from the hot list. */
export async function setMealHot(id: string, hot: boolean, nextOrder: number): Promise<void> {
  const { error } = await supabase.from('meals').update({ is_hot: hot, hot_order: hot ? nextOrder : 0 }).eq('id', id);
  if (error) fail('Could not update', error);
}

export async function reorderHotMeals(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_hot_meals', { p_ids: ids });
  if (error) fail('Could not reorder', error);
}
