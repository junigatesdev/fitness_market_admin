// Mirrors the Supabase tables from migration 0008_default_days.sql.

export const DAY_NAME_MAX = 40;
export const GROUP_NAME_MAX = 60;
export const MAX_DEPTH = 6;

export type NodeKind = 'group' | 'exercise';

/** One row of the tree: a group (named, may hold nodes) or an exercise (a leaf). */
export interface DayNode {
  /** Stable key for React and for the editing operations; not stored. */
  key: string;
  kind: NodeKind;
  /** The group's name; empty for an exercise. */
  name: string;
  exerciseId?: string;
  children: DayNode[];
}

export interface DefaultDay {
  id: string;
  name: string;
  sortOrder: number;
  published: boolean;
  nodes: DayNode[];
}

export interface NodeRow {
  id: string;
  parent_id: string | null;
  position: number;
  name: string | null;
  exercise_id: string | null;
}
export interface DefaultDayRow {
  id: string;
  name: string;
  sort_order: number;
  published: boolean;
  default_day_nodes: NodeRow[];
}

let keyCounter = 0;
export const newKey = () => `n${++keyCounter}`;

/** Rebuilds the tree from the flat rows, ordered by position at each level. */
export function buildTree(rows: NodeRow[]): DayNode[] {
  const byParent = new Map<string | null, NodeRow[]>();
  for (const r of rows) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
  const level = (parent: string | null): DayNode[] =>
    [...(byParent.get(parent) ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((r) =>
        r.exercise_id
          ? { key: newKey(), kind: 'exercise' as const, name: '', exerciseId: r.exercise_id, children: [] }
          : { key: newKey(), kind: 'group' as const, name: r.name ?? '', children: level(r.id) },
      );
  return level(null);
}

export const fromRow = (row: DefaultDayRow): DefaultDay => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  published: row.published,
  nodes: buildTree(row.default_day_nodes),
});

export function countExercises(nodes: DayNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.kind === 'exercise' ? 1 : countExercises(n.children)), 0);
}

export function exerciseIds(nodes: DayNode[]): string[] {
  return nodes.flatMap((n) => (n.kind === 'exercise' && n.exerciseId ? [n.exerciseId] : exerciseIds(n.children)));
}

/** "3 areas · 12 exercises". */
export function summarize(day: Pick<DefaultDay, 'nodes'>): string {
  const areas = day.nodes.filter((n) => n.kind === 'group').length;
  const exercises = countExercises(day.nodes);
  return `${areas} ${areas === 1 ? 'area' : 'areas'} · ${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`;
}

// ---- Editing. All operations return a new tree and leave the old one alone.

export function findNode(nodes: DayNode[], key: string): DayNode | undefined {
  for (const n of nodes) {
    if (n.key === key) return n;
    const inside = findNode(n.children, key);
    if (inside) return inside;
  }
  return undefined;
}

/** How deep a node sits: 1 for the top level. 0 if it is not in the tree. */
export function depthOf(nodes: DayNode[], key: string, depth = 1): number {
  for (const n of nodes) {
    if (n.key === key) return depth;
    const inside = depthOf(n.children, key, depth + 1);
    if (inside) return inside;
  }
  return 0;
}

function mapNode(nodes: DayNode[], key: string, change: (n: DayNode) => DayNode): DayNode[] {
  return nodes.map((n) => (n.key === key ? change(n) : { ...n, children: mapNode(n.children, key, change) }));
}

/** Adds [node] at the end of the group [parentKey], or at the top level when it is null. */
export function addNode(nodes: DayNode[], parentKey: string | null, node: DayNode): DayNode[] {
  if (parentKey === null) return [...nodes, node];
  return mapNode(nodes, parentKey, (p) => (p.kind === 'group' ? { ...p, children: [...p.children, node] } : p));
}

export const newGroup = (name: string): DayNode => ({ key: newKey(), kind: 'group', name, children: [] });
export const newExercise = (exerciseId: string): DayNode => ({ key: newKey(), kind: 'exercise', name: '', exerciseId, children: [] });

export function removeNode(nodes: DayNode[], key: string): DayNode[] {
  return nodes.filter((n) => n.key !== key).map((n) => ({ ...n, children: removeNode(n.children, key) }));
}

export function renameGroup(nodes: DayNode[], key: string, name: string): DayNode[] {
  return mapNode(nodes, key, (n) => (n.kind === 'group' ? { ...n, name } : n));
}

/** Moves a node one step up (-1) or down (+1) among its siblings; unchanged at the ends. */
export function moveNode(nodes: DayNode[], key: string, direction: -1 | 1): DayNode[] {
  const index = nodes.findIndex((n) => n.key === key);
  if (index >= 0) {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return nodes;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return nodes.map((n) => ({ ...n, children: moveNode(n.children, key, direction) }));
}

// ---- Saving

export interface DayDraft {
  id?: string;
  name: string;
  published: boolean;
  nodes: DayNode[];
}

export const blankDay = (): DayDraft => ({ name: '', published: false, nodes: [] });

export const toDraft = (d: DefaultDay): DayDraft => ({ id: d.id, name: d.name, published: d.published, nodes: d.nodes });

/** Error messages for the admin; empty when the day can be saved. `others` are the other days' names. */
export function validateDraft(draft: DayDraft, others: string[]): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Day name is required.');
  else if (name.length > DAY_NAME_MAX) errors.push(`Day name must be at most ${DAY_NAME_MAX} characters.`);
  else if (others.some((o) => o.trim().toLowerCase() === name.toLowerCase())) errors.push('Another day already has this name.');

  const check = (nodes: DayNode[]) => {
    for (const n of nodes) {
      if (n.kind === 'group') {
        const g = n.name.trim();
        if (!g) errors.push('Every group needs a name.');
        else if (g.length > GROUP_NAME_MAX) errors.push(`Group “${g.slice(0, 20)}…” is longer than ${GROUP_NAME_MAX} characters.`);
        if (n.children.length === 0) errors.push(`The group “${g || 'unnamed'}” is empty. Add an exercise or remove it.`);
        check(n.children);
      }
    }
  };
  check(draft.nodes);

  if (countExercises(draft.nodes) === 0) errors.push('Add at least one exercise.');
  const ids = exerciseIds(draft.nodes);
  if (new Set(ids).size !== ids.length) errors.push('An exercise can only appear once in a day.');
  return [...new Set(errors)];
}

interface PayloadNode {
  name?: string;
  exercise_id?: string;
  children?: PayloadNode[];
}

const toPayloadNodes = (nodes: DayNode[]): PayloadNode[] =>
  nodes.map((n) =>
    n.kind === 'exercise' ? { exercise_id: n.exerciseId } : { name: n.name.trim(), children: toPayloadNodes(n.children) },
  );

/** The payload for the save_default_day function. */
export function toPayload(d: DayDraft, sortOrder?: number) {
  return {
    id: d.id,
    name: d.name.trim(),
    published: d.published,
    sort_order: sortOrder,
    nodes: toPayloadNodes(d.nodes),
  };
}
