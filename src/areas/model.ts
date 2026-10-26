import { moveItem } from '../categories/model';

export { moveItem };

export const AREA_NAME_MAX = 60;

export interface Area {
  id: string;
  name: string;
  sortOrder: number;
  foodCount: number;
}

export interface AreaRow {
  id: string;
  name: string;
  sort_order: number;
  food_world_areas: { count: number }[];
}

export function fromRow(row: AreaRow): Area {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, foodCount: row.food_world_areas[0]?.count ?? 0 };
}

/** Error message for a proposed name, or null. `others` are the other areas' names (case-insensitive unique). */
export function validateAreaName(name: string, others: string[]): string | null {
  const n = name.trim();
  if (!n) return 'Area name is required.';
  if (n.length > AREA_NAME_MAX) return `Area name must be at most ${AREA_NAME_MAX} characters.`;
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return 'An area with this name already exists.';
  return null;
}

export function sortAreas(list: Area[]): Area[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
