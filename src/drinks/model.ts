// Mirrors the Supabase tables from migration 0009_drinks.sql.

export const DRINK_NAME_MAX = 40;

export interface Drink {
  id: string;
  name: string;
  sortOrder: number;
  published: boolean;
  cupMl: number;
  baseKcalPer100ml: number;
  asksMilk: boolean;
  milkDefaultMl: number;
  milkQuickMl: number[];
  asksSugar: boolean;
  sugarVariantId: string | null;
  sugarDefaultTsp: number;
  tspGrams: number;
  asksOther: boolean;
  /** Food preparation IDs offered as milk, in the order shown. */
  milkVariantIds: string[];
}

export interface DrinkRow {
  id: string;
  name: string;
  sort_order: number;
  published: boolean;
  cup_ml: number;
  base_kcal_per_100ml: number;
  asks_milk: boolean;
  milk_default_ml: number;
  milk_quick_ml: number[];
  asks_sugar: boolean;
  sugar_variant_id: string | null;
  sugar_default_tsp: number;
  tsp_grams: number;
  asks_other: boolean;
  drink_milks: { food_variant_id: string; position: number }[];
}

export const fromRow = (r: DrinkRow): Drink => ({
  id: r.id,
  name: r.name,
  sortOrder: r.sort_order,
  published: r.published,
  cupMl: Number(r.cup_ml),
  baseKcalPer100ml: Number(r.base_kcal_per_100ml),
  asksMilk: r.asks_milk,
  milkDefaultMl: Number(r.milk_default_ml),
  milkQuickMl: (r.milk_quick_ml ?? []).map(Number),
  asksSugar: r.asks_sugar,
  sugarVariantId: r.sugar_variant_id,
  sugarDefaultTsp: Number(r.sugar_default_tsp),
  tspGrams: Number(r.tsp_grams),
  asksOther: r.asks_other,
  milkVariantIds: [...(r.drink_milks ?? [])].sort((a, b) => a.position - b.position).map((m) => m.food_variant_id),
});

/** What the editor edits: numbers are kept as text so half-typed values survive. */
export interface DrinkDraft {
  id?: string;
  name: string;
  published: boolean;
  cupMl: string;
  baseKcalPer100ml: string;
  asksMilk: boolean;
  milkDefaultMl: string;
  /** Comma separated, e.g. "50, 100, 150". */
  milkQuickMl: string;
  milkVariantIds: string[];
  asksSugar: boolean;
  sugarVariantId: string;
  sugarDefaultTsp: string;
  tspGrams: string;
  asksOther: boolean;
}

export const blankDrink = (): DrinkDraft => ({
  name: '', published: false, cupMl: '250', baseKcalPer100ml: '0',
  asksMilk: true, milkDefaultMl: '100', milkQuickMl: '50, 100, 150', milkVariantIds: [],
  asksSugar: true, sugarVariantId: '', sugarDefaultTsp: '2', tspGrams: '4', asksOther: true,
});

export const toDraft = (d: Drink): DrinkDraft => ({
  id: d.id, name: d.name, published: d.published, cupMl: String(d.cupMl), baseKcalPer100ml: String(d.baseKcalPer100ml),
  asksMilk: d.asksMilk, milkDefaultMl: String(d.milkDefaultMl), milkQuickMl: d.milkQuickMl.join(', '),
  milkVariantIds: d.milkVariantIds, asksSugar: d.asksSugar, sugarVariantId: d.sugarVariantId ?? '',
  sugarDefaultTsp: String(d.sugarDefaultTsp), tspGrams: String(d.tspGrams), asksOther: d.asksOther,
});

/** A number from typed text; NaN when it is not one. A comma is accepted as the decimal point. */
export const num = (text: string): number => (text.trim() === '' ? NaN : Number(text.trim().replace(',', '.')));

/** "50, 100, 150" -> [50, 100, 150]; anything that is not a whole number above zero is dropped. */
export function parseQuick(text: string): number[] {
  const seen = new Set<number>();
  for (const part of text.split(/[\s,;]+/)) {
    const n = Number(part);
    if (part !== '' && Number.isInteger(n) && n > 0 && n <= 2000) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Error messages for the admin; empty when the drink can be saved. */
export function validateDraft(d: DrinkDraft, otherNames: string[]): string[] {
  const errors: string[] = [];
  const name = d.name.trim();
  if (!name) errors.push('Drink name is required.');
  else if (name.length > DRINK_NAME_MAX) errors.push(`Drink name must be at most ${DRINK_NAME_MAX} characters.`);
  else if (otherNames.some((o) => o.trim().toLowerCase() === name.toLowerCase())) errors.push('Another drink already has this name.');

  const cup = num(d.cupMl);
  if (!Number.isInteger(cup) || cup < 10 || cup > 2000) errors.push('Usual cup size must be a whole number of ml between 10 and 2000.');
  const base = num(d.baseKcalPer100ml);
  if (!(base >= 0)) errors.push('Calories of the tea or coffee itself must be 0 or more.');

  if (d.asksMilk) {
    const ml = num(d.milkDefaultMl);
    if (!Number.isInteger(ml) || ml < 0 || ml > 2000) errors.push('Starting milk must be a whole number of ml between 0 and 2000.');
    if (d.milkVariantIds.length === 0) errors.push('Pick at least one milk, or turn “Asks for milk” off.');
  }
  if (d.asksSugar) {
    if (!d.sugarVariantId) errors.push('Pick the sugar food, or turn “Asks for sugar” off.');
    const tsp = num(d.sugarDefaultTsp);
    if (!(tsp >= 0 && tsp <= 50)) errors.push('Starting sugar must be between 0 and 50 teaspoons.');
    const g = num(d.tspGrams);
    if (!(g > 0 && g <= 50)) errors.push('One teaspoon must weigh between 0 and 50 g.');
  }
  return errors;
}

/** The payload for the save_drink function. */
export function toPayload(d: DrinkDraft, sortOrder?: number) {
  return {
    id: d.id,
    name: d.name.trim(),
    published: d.published,
    sort_order: sortOrder,
    cup_ml: num(d.cupMl),
    base_kcal_per_100ml: num(d.baseKcalPer100ml),
    asks_milk: d.asksMilk,
    milk_default_ml: d.asksMilk ? num(d.milkDefaultMl) : 0,
    milk_quick_ml: parseQuick(d.milkQuickMl),
    milk_variant_ids: d.asksMilk ? d.milkVariantIds : [],
    asks_sugar: d.asksSugar,
    sugar_variant_id: d.asksSugar ? d.sugarVariantId : null,
    sugar_default_tsp: d.asksSugar ? num(d.sugarDefaultTsp) : 0,
    tsp_grams: d.asksSugar ? num(d.tspGrams) : 4,
    asks_other: d.asksOther,
  };
}

/** "250 ml · milk, sugar". */
export function summarize(d: Pick<Drink, 'cupMl' | 'asksMilk' | 'asksSugar' | 'asksOther'>): string {
  const asks = [d.asksMilk && 'milk', d.asksSugar && 'sugar', d.asksOther && 'other'].filter(Boolean).join(', ');
  return `${d.cupMl} ml · ${asks ? `asks ${asks}` : 'asks nothing'}`;
}
