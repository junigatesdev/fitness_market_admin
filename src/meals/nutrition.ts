import { Food, Variant } from '../foods/model';

export interface VariantRef {
  food: Food;
  variant: Variant;
}

export interface Totals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const ZERO: Totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function indexVariants(foods: Food[]): Map<string, VariantRef> {
  const map = new Map<string, VariantRef>();
  for (const food of foods) for (const variant of food.variants) map.set(variant.id, { food, variant });
  return map;
}

/** Nutrition for `amount` of a preparation (same unit as its basis), like the app's NutritionCalculator. */
export function scale(v: Variant, amount: number): Totals {
  const factor = amount / v.basisAmount;
  return { calories: v.calories * factor, proteinG: v.proteinG * factor, carbsG: v.carbsG * factor, fatG: v.fatG * factor };
}

/** Sums unrounded values; round only for display. Items whose preparation is unknown are skipped. */
export function sumItems(items: { variantId: string; amount: number }[], index: Map<string, VariantRef>): Totals {
  return items.reduce((acc, item) => {
    const ref = index.get(item.variantId);
    if (!ref || !Number.isFinite(item.amount) || item.amount <= 0) return acc;
    const t = scale(ref.variant, item.amount);
    return {
      calories: acc.calories + t.calories,
      proteinG: acc.proteinG + t.proteinG,
      carbsG: acc.carbsG + t.carbsG,
      fatG: acc.fatG + t.fatG,
    };
  }, ZERO);
}

export const roundKcal = (n: number) => Math.round(n);
export const roundGrams = (n: number) => Math.round(n * 10) / 10;

export function formatTotals(t: Totals): string {
  return `${roundKcal(t.calories)} kcal · P ${roundGrams(t.proteinG)} g · C ${roundGrams(t.carbsG)} g · F ${roundGrams(t.fatG)} g`;
}
