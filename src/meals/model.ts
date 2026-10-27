import { Food, UNIT_LABEL, parseNumber } from '../foods/model';
import { VariantRef } from './nutrition';

export const ACCENTS = ['GREEN', 'OCEAN', 'BLUE', 'NEUTRAL'] as const;
export type MealAccent = (typeof ACCENTS)[number];
export const accentLabel = (a: MealAccent) => a.charAt(0) + a.slice(1).toLowerCase();

export const MEAL_NAME_MAX = 100;
export const TAG_MAX = 40;

export interface MealItem {
  variantId: string;
  amount: number;
}

export interface Meal {
  id: string;
  name: string;
  tag: string;
  accent: MealAccent;
  published: boolean;
  /** Shown at the top of the app's Home screen. Only published meals can be hot. */
  isHot: boolean;
  /** Position among the hot meals (1 = first). 0 when not hot. */
  hotOrder: number;
  items: MealItem[];
}

export interface MealRow {
  id: string;
  name: string;
  tag: string;
  accent: MealAccent;
  published: boolean;
  /** Absent when the hot-meal columns don't exist yet (migration 0006 not run). */
  is_hot?: boolean;
  hot_order?: number;
  meal_items: { food_variant_id: string; amount: number; position: number }[];
}

export function fromRow(row: MealRow): Meal {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    accent: row.accent,
    published: row.published,
    isHot: row.is_hot ?? false,
    hotOrder: row.hot_order ?? 0,
    items: [...row.meal_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ variantId: i.food_variant_id, amount: Number(i.amount) })),
  };
}

export interface ItemDraft {
  key: string;
  variantId: string;
  amount: string;
}

export interface MealDraft {
  id?: string;
  name: string;
  tag: string;
  accent: MealAccent;
  published: boolean;
  isHot: boolean;
  items: ItemDraft[];
}

let keyCounter = 0;
const nextKey = () => `i${++keyCounter}`;

export const blankMeal = (): MealDraft => ({ name: '', tag: '', accent: 'GREEN', published: false, isHot: false, items: [] });

/** A new item starts at the preparation's own basis amount (e.g. 100 g). */
export function newItem(ref: VariantRef): ItemDraft {
  return { key: nextKey(), variantId: ref.variant.id, amount: String(ref.variant.basisAmount) };
}

export function toDraft(meal: Meal): MealDraft {
  return {
    id: meal.id,
    name: meal.name,
    tag: meal.tag,
    accent: meal.accent,
    published: meal.published,
    isHot: meal.isHot,
    items: meal.items.map((i) => ({ key: nextKey(), variantId: i.variantId, amount: String(i.amount) })),
  };
}

/** Names of the foods in `items` that are still drafts (the app can't read those). */
export function draftFoodNames(items: { variantId: string }[], index: Map<string, VariantRef>): string[] {
  const names = new Set<string>();
  for (const i of items) {
    const ref = index.get(i.variantId);
    if (ref && !ref.food.published) names.add(ref.food.name);
  }
  return [...names];
}

export function validateMeal(draft: MealDraft, index: Map<string, VariantRef>): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Meal name is required.');
  else if (name.length > MEAL_NAME_MAX) errors.push(`Meal name must be at most ${MEAL_NAME_MAX} characters.`);
  if (draft.tag.trim().length > TAG_MAX) errors.push(`Tag must be at most ${TAG_MAX} characters.`);
  if (draft.items.length === 0) errors.push('Add at least one food.');

  const seen = new Set<string>();
  for (const item of draft.items) {
    const ref = index.get(item.variantId);
    const label = ref ? `${ref.food.name} (${ref.variant.name})` : 'A food';
    if (!ref) errors.push(`${label} no longer exists. Remove it.`);
    if (seen.has(item.variantId)) errors.push(`${label} is added twice. Change its amount instead.`);
    seen.add(item.variantId);
    const amount = parseNumber(item.amount);
    if (!(Number.isFinite(amount) && amount > 0)) errors.push(`${label}: amount must be greater than 0.`);
  }
  if (draft.isHot && !draft.published) errors.push('A hot meal must be published. Tick Published, or untick Hot.');
  if (draft.published) {
    const drafts = draftFoodNames(draft.items, index);
    if (drafts.length > 0) errors.push(`Publish these foods first, or untick Published: ${drafts.join(', ')}.`);
  }
  return errors;
}

export function toPayload(draft: MealDraft) {
  return {
    id: draft.id ?? null,
    name: draft.name.trim(),
    tag: draft.tag.trim(),
    accent: draft.accent,
    published: draft.published,
    is_hot: draft.isHot,
    items: draft.items.map((i) => ({ food_variant_id: i.variantId, amount: parseNumber(i.amount) })),
  };
}

export function formatItem(item: MealItem, index: Map<string, VariantRef>): string {
  const ref = index.get(item.variantId);
  if (!ref) return 'Unknown food';
  return `${ref.food.name} (${ref.variant.name}) · ${item.amount} ${UNIT_LABEL[ref.variant.basisUnit]}`;
}

export type { Food };

/** Hot meals in the order the app shows them. */
export function hotMeals(meals: Meal[]): Meal[] {
  return meals.filter((m) => m.isHot).sort((a, b) => a.hotOrder - b.hotOrder || a.name.localeCompare(b.name));
}
