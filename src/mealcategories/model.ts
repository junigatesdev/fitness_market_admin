import { moveItem } from '../categories/model';

export { moveItem };

export const MEAL_CATEGORY_NAME_MAX = 60;

export interface MealCategory {
  id: string;
  name: string;
  sortOrder: number;
  mealCount: number;
}

export interface MealCategoryRow {
  id: string;
  name: string;
  sort_order: number;
  meal_category_links: { count: number }[];
}

export function fromRow(row: MealCategoryRow): MealCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    mealCount: row.meal_category_links[0]?.count ?? 0,
  };
}

/** Error message for a proposed name, or null. `others` are the other categories' names (case-insensitive unique). */
export function validateCategoryName(name: string, others: string[]): string | null {
  const n = name.trim();
  if (!n) return 'Category name is required.';
  if (n.length > MEAL_CATEGORY_NAME_MAX) return `Category name must be at most ${MEAL_CATEGORY_NAME_MAX} characters.`;
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return 'A category with this name already exists.';
  return null;
}

export function sortCategories(list: MealCategory[]): MealCategory[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
