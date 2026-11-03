import { describe, expect, it } from 'vitest';
import {
  addNode, blankDay, buildTree, countExercises, depthOf, exerciseIds, findNode, moveNode, newExercise, newGroup,
  removeNode, renameGroup, summarize, toPayload, validateDraft, type DayNode, type NodeRow,
} from './model';

const ex = (id: string) => newExercise(id);
const tree = (): DayNode[] => {
  let nodes: DayNode[] = [];
  const chest = newGroup('Chest');
  nodes = addNode(nodes, null, chest);
  nodes = addNode(nodes, chest.key, ex('bench'));
  nodes = addNode(nodes, chest.key, ex('incline'));
  const fly = newGroup('Dumbbell fly');
  nodes = addNode(nodes, chest.key, fly);
  nodes = addNode(nodes, fly.key, ex('flat-fly'));
  const back = newGroup('Back');
  nodes = addNode(nodes, null, back);
  nodes = addNode(nodes, back.key, ex('lat'));
  return nodes;
};

describe('buildTree', () => {
  it('rebuilds the nesting from flat rows, ordered by position at each level', () => {
    const rows: NodeRow[] = [
      { id: 'b', parent_id: null, position: 1, name: 'Back', exercise_id: null },
      { id: 'c', parent_id: null, position: 0, name: 'Chest', exercise_id: null },
      { id: 'c2', parent_id: 'c', position: 1, name: null, exercise_id: 'incline' },
      { id: 'c1', parent_id: 'c', position: 0, name: null, exercise_id: 'bench' },
      { id: 'b1', parent_id: 'b', position: 0, name: null, exercise_id: 'lat' },
    ];

    const nodes = buildTree(rows);

    expect(nodes.map((n) => n.name)).toEqual(['Chest', 'Back']);
    expect(nodes[0].children.map((n) => n.exerciseId)).toEqual(['bench', 'incline']);
    expect(nodes[1].children.map((n) => n.exerciseId)).toEqual(['lat']);
  });
});

describe('tree operations', () => {
  it('counts and lists exercises at every depth, and summarises', () => {
    const nodes = tree();
    expect(countExercises(nodes)).toBe(4);
    expect(exerciseIds(nodes)).toEqual(['bench', 'incline', 'flat-fly', 'lat']);
    expect(summarize({ nodes })).toBe('2 areas · 4 exercises');
    expect(summarize({ nodes: [nodes[0]] })).toBe('1 area · 3 exercises');
  });

  it('adds to a group or the top level, and measures depth', () => {
    const nodes = tree();
    const fly = nodes[0].children[2];
    expect(depthOf(nodes, nodes[0].key)).toBe(1);
    expect(depthOf(nodes, fly.key)).toBe(2);
    expect(depthOf(nodes, fly.children[0].key)).toBe(3);
    expect(depthOf(nodes, 'nope')).toBe(0);
    expect(addNode(nodes, null, ex('x')).length).toBe(3);
  });

  it('does not add anything inside an exercise', () => {
    const nodes = tree();
    const bench = nodes[0].children[0];
    expect(addNode(nodes, bench.key, ex('x'))).toEqual(nodes);
  });

  it('removes a node together with everything inside it, leaving the original alone', () => {
    const nodes = tree();
    const fly = nodes[0].children[2];
    const next = removeNode(nodes, fly.key);
    expect(exerciseIds(next)).toEqual(['bench', 'incline', 'lat']);
    expect(exerciseIds(nodes)).toContain('flat-fly');
  });

  it('renames groups only', () => {
    const nodes = tree();
    expect(renameGroup(nodes, nodes[1].key, 'Pull')[1].name).toBe('Pull');
    const bench = nodes[0].children[0];
    expect(findNode(renameGroup(nodes, bench.key, 'x'), bench.key)?.name).toBe('');
  });

  it('moves a node among its siblings, at any depth, and stops at the ends', () => {
    const nodes = tree();
    expect(moveNode(nodes, nodes[1].key, -1).map((n) => n.name)).toEqual(['Back', 'Chest']);
    expect(moveNode(nodes, nodes[0].key, -1)).toBe(nodes);
    const incline = nodes[0].children[1];
    expect(moveNode(nodes, incline.key, -1)[0].children.map((n) => n.exerciseId)).toEqual(['incline', 'bench', undefined]);
  });
});

describe('validateDraft', () => {
  const ok = { ...blankDay(), name: 'Upper body', nodes: tree() };

  it('accepts a complete day', () => {
    expect(validateDraft(ok, [])).toEqual([]);
  });

  it('needs a name that is not taken, and at least one exercise', () => {
    expect(validateDraft({ ...ok, name: ' ' }, [])).toContain('Day name is required.');
    expect(validateDraft({ ...ok, name: 'PUSH' }, ['Push'])).toContain('Another day already has this name.');
    expect(validateDraft({ ...blankDay(), name: 'Empty' }, [])).toContain('Add at least one exercise.');
  });

  it('rejects unnamed or empty groups and repeated exercises', () => {
    const unnamed = addNode([], null, newGroup(''));
    const errors = validateDraft({ ...blankDay(), name: 'X', nodes: unnamed }, []);
    expect(errors).toContain('Every group needs a name.');
    expect(errors.some((m) => m.includes('is empty'))).toBe(true);

    const twice = addNode(addNode([], null, ex('a')), null, ex('a'));
    expect(validateDraft({ ...blankDay(), name: 'X', nodes: twice }, [])).toContain('An exercise can only appear once in a day.');
  });
});

describe('toPayload', () => {
  it('sends the tree for save_default_day, with groups and exercises told apart', () => {
    const payload = toPayload({ id: 'd1', name: ' Upper body ', published: true, nodes: tree() }, 3);

    expect(payload).toMatchObject({ id: 'd1', name: 'Upper body', published: true, sort_order: 3 });
    expect(payload.nodes).toEqual([
      {
        name: 'Chest',
        children: [
          { exercise_id: 'bench' },
          { exercise_id: 'incline' },
          { name: 'Dumbbell fly', children: [{ exercise_id: 'flat-fly' }] },
        ],
      },
      { name: 'Back', children: [{ exercise_id: 'lat' }] },
    ]);
  });
});
