import { FormEvent, useCallback, useEffect, useState } from 'react';
import { moveItem } from '../categories/model';
import * as api from './api';
import { ExerciseTag, MuscleGroup, validateListName } from './model';

interface Entry {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  exerciseCount: number;
}

interface ListConfig {
  title: string;
  /** "Muscle group" or "Tag", used in messages. */
  noun: string;
  hint: string;
  addLabel: string;
  placeholder: string;
  deleteWarning: (e: Entry) => string;
  add: (name: string, sortOrder: number) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}

const GROUPS: ListConfig = {
  title: 'Muscle groups',
  noun: 'Muscle group',
  hint: '“Other” is the generic default: it can’t be deleted. Deleting another group moves its exercises to “Other”.',
  addLabel: 'Add muscle group',
  placeholder: 'New muscle group, e.g. Glutes',
  deleteWarning: (e) =>
    `Delete the muscle group “${e.name}”?${e.exerciseCount > 0 ? ` Its ${e.exerciseCount} exercise${e.exerciseCount === 1 ? '' : 's'} will move to “Other”.` : ''}`,
  add: api.addMuscleGroup,
  rename: api.renameMuscleGroup,
  remove: api.deleteMuscleGroup,
  reorder: api.reorderMuscleGroups,
};

const TAGS: ListConfig = {
  title: 'Tags',
  noun: 'Tag',
  hint: 'An exercise can have any number of tags. Deleting a tag only removes it from the exercises that have it.',
  addLabel: 'Add tag',
  placeholder: 'New tag, e.g. Chest day',
  deleteWarning: (e) =>
    `Delete the tag “${e.name}”?${e.exerciseCount > 0 ? ` It will be removed from ${e.exerciseCount} exercise${e.exerciseCount === 1 ? '' : 's'}.` : ''}`,
  add: api.addTag,
  rename: api.renameTag,
  remove: api.deleteTag,
  reorder: api.reorderTags,
};

const fromGroup = (g: MuscleGroup): Entry => g;
const fromTag = (t: ExerciseTag): Entry => ({ ...t, isDefault: false });

export function GroupsTagsPage({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="toolbar">
        <button type="button" className="outline" onClick={onBack}>← Exercises</button>
      </div>
      <ManagedList config={GROUPS} load={async () => (await api.listMuscleGroups()).map(fromGroup)} />
      <ManagedList config={TAGS} load={async () => (await api.listTags()).map(fromTag)} />
    </>
  );
}

function ManagedList({ config, load: fetchEntries }: { config: ListConfig; load: () => Promise<Entry[]> }) {
  const [entries, setEntries] = useState<Entry[]>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      setEntries(await fetchEntries());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : `Could not load ${config.title.toLowerCase()}.`);
    }
  }, [fetchEntries, config.title]);

  useEffect(() => {
    void load();
    // `fetchEntries` is a new function every render of the parent; loading once on mount is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs a change, then reloads. Shows the error and keeps the screen as it was if it fails. */
  async function change(action: () => Promise<void>): Promise<boolean> {
    setActionError(undefined);
    setBusy(true);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const list = entries ?? [];
    const problem = validateListName(config.noun, newName, list.map((x) => x.name));
    if (problem) return setActionError(problem);
    const next = Math.max(0, ...list.map((x) => x.sortOrder)) + 1;
    if (await change(() => config.add(newName, next))) setNewName('');
  }

  async function handleRename(entry: Entry) {
    const others = (entries ?? []).filter((x) => x.id !== entry.id).map((x) => x.name);
    const problem = validateListName(config.noun, editName, others);
    if (problem) return setActionError(problem);
    if (await change(() => config.rename(entry.id, editName))) setEditingId(undefined);
  }

  function handleDelete(entry: Entry) {
    if (!window.confirm(config.deleteWarning(entry))) return;
    void change(() => config.remove(entry.id));
  }

  function handleMove(entry: Entry, direction: -1 | 1) {
    const movable = (entries ?? []).filter((x) => !x.isDefault);
    const moved = moveItem(movable, movable.findIndex((x) => x.id === entry.id), direction);
    const ids = [...(entries ?? []).filter((x) => x.isDefault), ...moved].map((x) => x.id);
    void change(() => config.reorder(ids));
  }

  if (loadError) {
    return (
      <section className="panel" aria-label={config.title}>
        <p role="alert" className="form-error">{loadError}</p>
        <button type="button" className="outline" onClick={() => void load()}>Try again</button>
      </section>
    );
  }
  if (entries === undefined) return <p className="loading">Loading {config.title.toLowerCase()}…</p>;

  const movable = entries.filter((x) => !x.isDefault);

  return (
    <section aria-label={config.title} className="managed">
      <h2>{config.title}</h2>
      <form className="toolbar" onSubmit={handleAdd} noValidate>
        <input aria-label={`New ${config.noun.toLowerCase()} name`} placeholder={config.placeholder} value={newName}
          maxLength={60} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="primary add" disabled={busy}>{config.addLabel}</button>
      </form>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      <ul className="panel cat-list">
        {entries.map((x) => {
          const pos = movable.findIndex((m) => m.id === x.id);
          return (
            <li key={x.id} className="cat-row">
              {editingId === x.id ? (
                <>
                  <input aria-label={`Rename ${x.name}`} value={editName} maxLength={60} autoFocus
                    onChange={(e) => setEditName(e.target.value)} />
                  <button type="button" className="outline" disabled={busy} onClick={() => void handleRename(x)}>Save</button>
                  <button type="button" className="link" onClick={() => { setEditingId(undefined); setActionError(undefined); }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="cat-name">
                    {x.name} {x.isDefault && <span className="badge on">Default</span>}
                  </span>
                  <span className="stat-note">{x.exerciseCount} {x.exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                  <span className="cat-actions">
                    {!x.isDefault && (
                      <>
                        <button type="button" className="icon-btn" aria-label={`Move ${x.name} up`}
                          disabled={busy || pos <= 0} onClick={() => handleMove(x, -1)}>▲</button>
                        <button type="button" className="icon-btn" aria-label={`Move ${x.name} down`}
                          disabled={busy || pos === movable.length - 1} onClick={() => handleMove(x, 1)}>▼</button>
                      </>
                    )}
                    <button type="button" className="outline"
                      onClick={() => { setEditingId(x.id); setEditName(x.name); setActionError(undefined); }}>
                      Rename
                    </button>
                    {!x.isDefault && (
                      <button type="button" className="outline danger" disabled={busy} onClick={() => handleDelete(x)}>Delete</button>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint">{config.hint}</p>
    </section>
  );
}
