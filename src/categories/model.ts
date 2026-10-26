export const CATEGORY_NAME_MAX = 60;

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  foodCount: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  foods: { count: number }[];
}

export function fromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    foodCount: row.foods[0]?.count ?? 0,
  };
}

/** Error message for a proposed name, or null. `others` are the other categories' names (case-insensitive unique). */
export function validateCategoryName(name: string, others: string[]): string | null {
  const n = name.trim();
  if (!n) return 'Category name is required.';
  if (n.length > CATEGORY_NAME_MAX) return `Category name must be at most ${CATEGORY_NAME_MAX} characters.`;
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return 'A category with this name already exists.';
  return null;
}

/** The default first, then by saved order, then by name. */
export function sortCategories(list: Category[]): Category[] {
  return [...list].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** `list` with the item at `index` moved one step up (-1) or down (+1); unchanged at the ends. */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
