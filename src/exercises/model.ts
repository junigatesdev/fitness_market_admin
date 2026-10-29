// Mirrors the Supabase tables from migration 0007_exercises.sql.

export const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced',
};

export const MEASURES = ['REPS', 'SECONDS'] as const;
export type Measure = (typeof MEASURES)[number];

/** Suggestions only: equipment is free text, so anything can be typed. */
export const EQUIPMENT_SUGGESTIONS = [
  'Bodyweight', 'Dumbbell', 'Barbell', 'Kettlebell', 'Machine', 'Cable', 'Resistance band', 'Smith machine', 'Bench',
];

export const NAME_MAX = 100;
export const LIST_NAME_MAX = 60;
export const EQUIPMENT_MAX = 60;
export const INSTRUCTIONS_MAX = 2000;
export const SETS_MAX = 20;
export const TARGET_MAX = 999;

export interface MuscleGroup {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  exerciseCount: number;
}

export interface ExerciseTag {
  id: string;
  name: string;
  sortOrder: number;
  exerciseCount: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroupId: string;
  equipment: string;
  difficulty: Difficulty;
  instructions: string;
  measure: Measure;
  defaultSets: number;
  /** Reps per set, or seconds per set, depending on `measure`. */
  defaultTarget: number;
  usesWeight: boolean;
  published: boolean;
  tagIds: string[];
}

/** Database row shapes (snake_case), as PostgREST returns them. */
export interface ExerciseRow {
  id: string;
  name: string;
  muscle_group_id: string;
  equipment: string;
  difficulty: Difficulty;
  instructions: string;
  measure: Measure;
  default_sets: number;
  default_target: number;
  uses_weight: boolean;
  published: boolean;
  exercise_tag_links: { tag_id: string }[];
}
export interface MuscleGroupRow {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  exercises: { count: number }[];
}
export interface ExerciseTagRow {
  id: string;
  name: string;
  sort_order: number;
  exercise_tag_links: { count: number }[];
}

export function fromRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscleGroupId: row.muscle_group_id,
    equipment: row.equipment,
    difficulty: row.difficulty,
    instructions: row.instructions,
    measure: row.measure,
    defaultSets: row.default_sets,
    defaultTarget: row.default_target,
    usesWeight: row.uses_weight,
    published: row.published,
    tagIds: row.exercise_tag_links.map((l) => l.tag_id),
  };
}

export const groupFromRow = (row: MuscleGroupRow): MuscleGroup => ({
  id: row.id, name: row.name, sortOrder: row.sort_order, isDefault: row.is_default,
  exerciseCount: row.exercises[0]?.count ?? 0,
});

export const tagFromRow = (row: ExerciseTagRow): ExerciseTag => ({
  id: row.id, name: row.name, sortOrder: row.sort_order, exerciseCount: row.exercise_tag_links[0]?.count ?? 0,
});

/** "3 × 8 reps" or "3 × 45 s". */
export function formatDefault(e: Pick<Exercise, 'measure' | 'defaultSets' | 'defaultTarget'>): string {
  return e.measure === 'SECONDS'
    ? `${e.defaultSets} × ${e.defaultTarget} s`
    : `${e.defaultSets} × ${e.defaultTarget} reps`;
}

/** The default first, then by saved order, then by name. */
export function sortGroups(list: MuscleGroup[]): MuscleGroup[] {
  return [...list].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export function sortTags(list: ExerciseTag[]): ExerciseTag[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Error message for a proposed group or tag name, or null. `others` are the other names (case-insensitive unique). */
export function validateListName(noun: string, name: string, others: string[]): string | null {
  const n = name.trim();
  if (!n) return `${noun} name is required.`;
  if (n.length > LIST_NAME_MAX) return `${noun} name must be at most ${LIST_NAME_MAX} characters.`;
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return `A ${noun.toLowerCase()} with this name already exists.`;
  return null;
}

// ---- Editing. Numbers are kept as text while typing so "" doesn't fight the user.

export interface ExerciseDraft {
  id?: string;
  name: string;
  muscleGroupId: string;
  equipment: string;
  difficulty: Difficulty;
  instructions: string;
  measure: Measure;
  defaultSets: string;
  defaultTarget: string;
  usesWeight: boolean;
  published: boolean;
  tagIds: string[];
}

export const blankExercise = (muscleGroupId: string): ExerciseDraft => ({
  name: '', muscleGroupId, equipment: '', difficulty: 'BEGINNER', instructions: '', measure: 'REPS',
  defaultSets: '3', defaultTarget: '10', usesWeight: true, published: false, tagIds: [],
});

export const toDraft = (e: Exercise): ExerciseDraft => ({
  id: e.id, name: e.name, muscleGroupId: e.muscleGroupId, equipment: e.equipment, difficulty: e.difficulty,
  instructions: e.instructions, measure: e.measure, defaultSets: String(e.defaultSets),
  defaultTarget: String(e.defaultTarget), usesWeight: e.usesWeight, published: e.published, tagIds: [...e.tagIds],
});

/** A whole number from text, or NaN. */
export function parseWhole(text: string): number {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

const inRange = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

/** `others` are the other exercises' names (case-insensitive unique). Returns messages for the admin. */
export function validateDraft(draft: ExerciseDraft, others: string[]): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Exercise name is required.');
  else if (name.length > NAME_MAX) errors.push(`Exercise name must be at most ${NAME_MAX} characters.`);
  else if (others.some((o) => o.trim().toLowerCase() === name.toLowerCase())) {
    errors.push('Another exercise already has this name.');
  }
  if (!draft.muscleGroupId) errors.push('Pick a muscle group.');
  if (draft.equipment.trim().length > EQUIPMENT_MAX) errors.push(`Equipment must be at most ${EQUIPMENT_MAX} characters.`);
  if (draft.instructions.length > INSTRUCTIONS_MAX) errors.push(`How-to text must be at most ${INSTRUCTIONS_MAX} characters.`);
  if (!inRange(parseWhole(draft.defaultSets), SETS_MAX)) errors.push(`Sets must be a whole number from 1 to ${SETS_MAX}.`);
  const what = draft.measure === 'SECONDS' ? 'Seconds' : 'Reps';
  if (!inRange(parseWhole(draft.defaultTarget), TARGET_MAX)) errors.push(`${what} must be a whole number from 1 to ${TARGET_MAX}.`);
  return errors;
}

/** The payload for the save_exercise function. */
export function toPayload(d: ExerciseDraft) {
  return {
    id: d.id,
    name: d.name.trim(),
    muscle_group_id: d.muscleGroupId,
    equipment: d.equipment.trim(),
    difficulty: d.difficulty,
    instructions: d.instructions.trim(),
    measure: d.measure,
    default_sets: parseWhole(d.defaultSets),
    default_target: parseWhole(d.defaultTarget),
    uses_weight: d.usesWeight,
    published: d.published,
    tag_ids: d.tagIds,
  };
}
