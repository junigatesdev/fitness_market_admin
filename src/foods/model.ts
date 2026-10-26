// Mirrors the Android domain model (domain/model/food) and the Supabase tables.

export const QUANTITY_UNITS = ['GRAM', 'MILLILITER', 'PIECE', 'SERVING'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const UNIT_LABEL: Record<QuantityUnit, string> = { GRAM: 'g', MILLILITER: 'ml', PIECE: 'piece', SERVING: 'serving' };

/** Suggestions only: a preparation name is free text, so any style can be typed. */
export const PREPARATION_SUGGESTIONS = [
  'Raw', 'Cooked', 'Home cooked', 'Restaurant cooked', 'Boiled', 'Steamed', 'Baked', 'Grilled', 'Roasted',
  'Pan fried', 'Deep fried', 'Air fried', 'Stir fried', 'Slow cooked', 'Pressure cooked', 'Smoked', 'Canned', 'Frozen',
];

/** Same limit as the Android app's FoodValidator. */
export const NAME_MAX_LENGTH = 100;

export interface Variant {
  id: string;
  name: string;
  basisAmount: number;
  basisUnit: QuantityUnit;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Food {
  id: string;
  name: string;
  categoryId: string;
  published: boolean;
  variants: Variant[];
}

/** Database row shapes (snake_case), as PostgREST returns them. */
export interface VariantRow {
  id: string;
  name: string;
  basis_amount: number;
  basis_unit: QuantityUnit;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
export interface FoodRow {
  id: string;
  name: string;
  category_id: string;
  published: boolean;
  food_variants: VariantRow[];
}

export function fromRow(row: FoodRow): Food {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    published: row.published,
    variants: [...row.food_variants]
      .map((v) => ({
        id: v.id,
        name: v.name,
        basisAmount: Number(v.basis_amount),
        basisUnit: v.basis_unit,
        calories: Number(v.calories),
        proteinG: Number(v.protein_g),
        carbsG: Number(v.carbs_g),
        fatG: Number(v.fat_g),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---- Editing. Numbers are kept as text while typing so "1." or "" don't fight the user.

export interface VariantDraft {
  key: string; // stable React key
  id?: string; // absent until saved
  name: string;
  basisAmount: string;
  basisUnit: QuantityUnit;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

export interface FoodDraft {
  id?: string;
  name: string;
  categoryId: string;
  published: boolean;
  variants: VariantDraft[];
}

let keyCounter = 0;
const nextKey = () => `v${++keyCounter}`;

export const blankVariant = (): VariantDraft => ({
  key: nextKey(), name: '', basisAmount: '100', basisUnit: 'GRAM',
  calories: '', proteinG: '', carbsG: '', fatG: '',
});

export const blankFood = (categoryId: string): FoodDraft => ({
  name: '', categoryId, published: false, variants: [blankVariant()],
});

export function toDraft(food: Food): FoodDraft {
  return {
    id: food.id,
    name: food.name,
    categoryId: food.categoryId,
    published: food.published,
    variants: food.variants.map((v) => ({
      key: nextKey(), id: v.id, name: v.name, basisAmount: String(v.basisAmount), basisUnit: v.basisUnit,
      calories: String(v.calories), proteinG: String(v.proteinG), carbsG: String(v.carbsG), fatG: String(v.fatG),
    })),
  };
}

/** Empty or non-numeric text is NaN (invalid); a comma decimal separator is accepted. */
export function parseNumber(text: string): number {
  const t = text.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
}

const validAmount = (n: number) => Number.isFinite(n) && n >= 0;

/** Same rules as the app's FoodValidator: reject impossible values only. Returns messages for the admin. */
export function validateDraft(draft: FoodDraft): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Food name is required.');
  else if (name.length > NAME_MAX_LENGTH) errors.push(`Food name must be at most ${NAME_MAX_LENGTH} characters.`);
  if (draft.variants.length === 0) errors.push('Add at least one preparation.');

  const seen = new Set<string>();
  draft.variants.forEach((v, i) => {
    const vn = v.name.trim();
    const label = vn || `Preparation ${i + 1}`;
    if (!vn) errors.push(`${label}: name is required.`);
    else if (vn.length > NAME_MAX_LENGTH) errors.push(`${label}: name must be at most ${NAME_MAX_LENGTH} characters.`);
    if (vn) {
      if (seen.has(vn.toLowerCase())) errors.push(`${label}: another preparation already has this name.`);
      seen.add(vn.toLowerCase());
    }
    const amount = parseNumber(v.basisAmount);
    if (!(Number.isFinite(amount) && amount > 0)) errors.push(`${label}: amount must be greater than 0.`);
    const nutrients: [string, string][] = [
      ['calories', v.calories], ['protein', v.proteinG], ['carbs', v.carbsG], ['fat', v.fatG],
    ];
    for (const [n, text] of nutrients) {
      if (!validAmount(parseNumber(text))) errors.push(`${label}: ${n} must be a number, 0 or more.`);
    }
  });
  return errors;
}

/** Payload for the save_food database function. Call only after validateDraft returns no errors. */
export function toPayload(draft: FoodDraft) {
  return {
    id: draft.id ?? null,
    name: draft.name.trim(),
    category_id: draft.categoryId,
    published: draft.published,
    variants: draft.variants.map((v) => ({
      id: v.id ?? null,
      name: v.name.trim(),
      basis_amount: parseNumber(v.basisAmount),
      basis_unit: v.basisUnit,
      calories: parseNumber(v.calories),
      protein_g: parseNumber(v.proteinG),
      carbs_g: parseNumber(v.carbsG),
      fat_g: parseNumber(v.fatG),
    })),
  };
}

/** Atwater estimate (4/4/9 kcal per g). A sanity hint, not a rule: fibre and alcohol make real values differ. */
export function estimatedCalories(protein: number, carbs: number, fat: number): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

/** True when stated calories are >15 kcal and >20% away from what the macros add up to. */
export function caloriesLookOff(v: VariantDraft): boolean {
  const cal = parseNumber(v.calories);
  const p = parseNumber(v.proteinG);
  const c = parseNumber(v.carbsG);
  const f = parseNumber(v.fatG);
  if (![cal, p, c, f].every(Number.isFinite)) return false;
  const est = estimatedCalories(p, c, f);
  const diff = Math.abs(est - cal);
  return diff > 15 && diff > 0.2 * Math.max(est, cal);
}

export function formatVariant(v: Variant): string {
  const basis = v.basisUnit === 'GRAM' && v.basisAmount === 100 ? 'per 100 g' : `per ${v.basisAmount} ${UNIT_LABEL[v.basisUnit]}`;
  return `${v.name}: ${Math.round(v.calories)} kcal ${basis}`;
}
