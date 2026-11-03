import { FormEvent, useMemo, useState } from 'react';
import { Exercise, MuscleGroup } from '../exercises/model';
import {
  DayDraft, DayNode, MAX_DEPTH, addNode, countExercises, depthOf, findNode, moveNode, newExercise, newGroup,
  removeNode, renameGroup, summarize, toPayload, validateDraft, exerciseIds,
} from './model';

interface DefaultDayEditorProps {
  initial: DayDraft;
  exercises: Exercise[];
  groups: MuscleGroup[];
  /** Names of the other days, for the duplicate-name check. */
  otherNames: string[];
  onSave: (payload: ReturnType<typeof toPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function DefaultDayEditor({ initial, exercises, groups, otherNames, onSave, onDelete, onClose }: DefaultDayEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** The group new exercises and groups go into; null means the top level. */
  const [target, setTarget] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const isNew = initial.id === undefined;

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const used = useMemo(() => new Set(exerciseIds(draft.nodes)), [draft.nodes]);
  const targetNode = target ? findNode(draft.nodes, target) : undefined;
  const targetName = targetNode ? targetNode.name || 'unnamed group' : 'the top level';
  const canAddGroup = target === null ? true : depthOf(draft.nodes, target) < MAX_DEPTH;

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter(
      (e) => (!group || e.muscleGroupId === group) && (!q || e.name.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q)),
    );
  }, [exercises, search, group]);

  const setNodes = (nodes: DayNode[]) => setDraft((d) => ({ ...d, nodes }));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Something went wrong. Try again.']);
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateDraft(draft, otherNames);
    setErrors(found);
    if (found.length === 0) void run(() => onSave(toPayload(draft)));
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!window.confirm(`Delete the default day "${initial.name}"? Customers who already have it keep their copy.`)) return;
    void run(onDelete);
  }

  function addTopGroup() {
    const g = newGroup('');
    setNodes(addNode(draft.nodes, target, g));
    setTarget(g.key);
  }

  function renderNodes(nodes: DayNode[], depth: number) {
    return nodes.map((n) => {
      const indent = 12 + depth * 24;
      if (n.kind === 'exercise') {
        const ex = n.exerciseId ? byId.get(n.exerciseId) : undefined;
        return (
          <li key={n.key} className="tree-row" style={{ paddingLeft: indent + 26 }}>
            <span className="tree-dot" aria-hidden="true" />
            <span className="tree-name">{ex?.name ?? 'Unknown exercise'}</span>
            {ex === undefined && <span className="badge">Missing</span>}
            {ex !== undefined && !ex.published && <span className="badge warn-badge">Draft, will be skipped</span>}
            <span className="tree-actions">
              <button type="button" className="icon-btn" aria-label={`Move ${ex?.name ?? 'exercise'} up`} onClick={() => setNodes(moveNode(draft.nodes, n.key, -1))}>▲</button>
              <button type="button" className="icon-btn" aria-label={`Move ${ex?.name ?? 'exercise'} down`} onClick={() => setNodes(moveNode(draft.nodes, n.key, 1))}>▼</button>
              <button type="button" className="link danger" aria-label={`Remove ${ex?.name ?? 'exercise'}`} onClick={() => setNodes(removeNode(draft.nodes, n.key))}>Remove</button>
            </span>
          </li>
        );
      }
      const selected = target === n.key;
      return (
        <li key={n.key} className="tree-group">
          <div className={`tree-row group${selected ? ' selected' : ''}`} style={{ paddingLeft: indent }}>
            <button type="button" className="tree-pick" aria-pressed={selected} aria-label={`Add into ${n.name || 'unnamed group'}`}
              onClick={() => setTarget(selected ? null : n.key)}>{selected ? '◉' : '○'}</button>
            <input aria-label="Group name" className="tree-input" value={n.name} maxLength={60} placeholder="Group name, e.g. Chest"
              onChange={(e) => setNodes(renameGroup(draft.nodes, n.key, e.target.value))} />
            <span className="badge on">{countExercises(n.children)} exercises</span>
            <span className="tree-actions">
              <button type="button" className="icon-btn" aria-label={`Move ${n.name || 'group'} up`} onClick={() => setNodes(moveNode(draft.nodes, n.key, -1))}>▲</button>
              <button type="button" className="icon-btn" aria-label={`Move ${n.name || 'group'} down`} onClick={() => setNodes(moveNode(draft.nodes, n.key, 1))}>▼</button>
              <button type="button" className="link danger" aria-label={`Remove ${n.name || 'group'}`} onClick={() => {
                if (target === n.key) setTarget(null);
                setNodes(removeNode(draft.nodes, n.key));
              }}>Remove</button>
            </span>
          </div>
          <ul className="tree-list">{renderNodes(n.children, depth + 1)}</ul>
        </li>
      );
    });
  }

  return (
    <form className="editor-page" aria-label="Default day editor" onSubmit={handleSubmit} noValidate>
      <header className="editor-head">
        <button type="button" className="link" onClick={onClose} disabled={busy}>← Default days</button>
        <h2>{isNew ? 'New default day' : initial.name}</h2>
        <span className="spacer" />
        {onDelete && <button type="button" className="outline danger" onClick={handleDelete} disabled={busy}>Delete</button>}
        <button type="submit" className="primary save" disabled={busy}>{busy ? 'Saving…' : 'Save default day'}</button>
      </header>

      {errors.length > 0 && (
        <ul role="alert" className="form-error error-list">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
      )}

      <div className="editor-grid">
        <div className="editor-col">
          <section className="panel editor-card" aria-label="Day">
            <h3>Day</h3>
            <label htmlFor="day-name">Name</label>
            <input id="day-name" value={draft.name} maxLength={40} placeholder="e.g. Upper body"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label className="check">
              <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
              Published (copied to new customers)
            </label>
          </section>

          <section className="panel editor-card" aria-label="What is inside">
            <h3>What is inside</h3>
            <p className="hint">
              Areas, groups and exercises go as deep as needed. An item with things inside ticks itself when everything inside
              is ticked; customers tick the last level. Pick a group (◉) to choose where new things go.
            </p>
            {draft.nodes.length === 0 && <p className="hint">Nothing yet. Add an area, or add exercises straight from the list.</p>}
            <ul className="tree-list root">{renderNodes(draft.nodes, 0)}</ul>
            <div className="tree-add">
              <button type="button" className="outline" disabled={!canAddGroup} onClick={addTopGroup}>
                {target === null ? '+ Add area' : '+ Add group inside'}
              </button>
            </div>
          </section>
        </div>

        <div className="editor-col">
          <section className="panel editor-card" aria-label="Add exercises">
            <h3>Add exercises</h3>
            <p className="hint">Adding to: <b>{targetName}</b></p>
            <input type="search" aria-label="Search exercises" placeholder="Search exercises" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Filter by muscle group" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All muscle groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <ul className="pick-list">
              {results.slice(0, 40).map((e) => (
                <li key={e.id} className="pick-row">
                  <span><b>{e.name}</b>{e.equipment ? <span className="stat-note"> · {e.equipment}</span> : null}{!e.published && <span className="badge"> Draft</span>}</span>
                  {used.has(e.id) ? (
                    <span className="stat-note">Added</span>
                  ) : (
                    <button type="button" className="link" aria-label={`Add ${e.name}`}
                      onClick={() => setNodes(addNode(draft.nodes, target, newExercise(e.id)))}>+ Add</button>
                  )}
                </li>
              ))}
              {results.length === 0 && <li className="stat-note">No exercises match.</li>}
            </ul>
          </section>
          <section className="panel editor-card" aria-label="Preview">
            <h3>Preview in the app</h3>
            <p className="hint">{summarize(draft)}. Customers see the first level as the areas of the day.</p>
          </section>
        </div>
      </div>
    </form>
  );
}
