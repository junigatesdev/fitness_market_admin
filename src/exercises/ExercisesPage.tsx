import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { ExerciseEditor } from './ExerciseEditor';
import { GroupsTagsPage } from './GroupsTagsPage';
import {
  DIFFICULTY_LABEL, Exercise, ExerciseDraft, ExerciseTag, MuscleGroup, blankExercise, formatDefault, toDraft,
} from './model';

/** The tables come from migration 0007; until it is run the screen explains what to do instead of failing. */
const looksLikeMissingTables = (message: string) => /exercise|muscle_groups|schema cache/i.test(message);

export function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>();
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [tags, setTags] = useState<ExerciseTag[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState<ExerciseDraft>();
  const [managing, setManaging] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [e, g, t] = await Promise.all([api.listExercises(), api.listMuscleGroups(), api.listTags()]);
      setGroups(g);
      setTags(t);
      setExercises(e);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load exercises.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercises ?? []).filter(
      (x) =>
        (!group || x.muscleGroupId === group) &&
        (!tag || x.tagIds.includes(tag)) &&
        (!q || x.name.toLowerCase().includes(q) || x.equipment.toLowerCase().includes(q)),
    );
  }, [exercises, search, group, tag]);

  async function togglePublished(x: Exercise) {
    setActionError(undefined);
    try {
      await api.setPublished(x.id, !x.published);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update.');
    }
  }

  async function handleSave(payload: Parameters<typeof api.saveExercise>[0]) {
    await api.saveExercise(payload);
    setEditing(undefined);
    await load();
  }

  async function handleDelete(id: string) {
    await api.deleteExercise(id);
    setEditing(undefined);
    await load();
  }

  if (managing) {
    return (
      <GroupsTagsPage
        onBack={() => {
          setManaging(false);
          void load();
        }}
      />
    );
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" aria-label="Search exercises" placeholder="Search exercises" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by muscle group" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All muscle groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" className="outline" onClick={() => setManaging(true)}>Manage groups &amp; tags</button>
        <button type="button" className="primary add"
          onClick={() => setEditing(blankExercise(groups.find((g) => g.isDefault)?.id ?? groups[0]?.id ?? ''))}>
          Add exercise
        </button>
      </div>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {loadError ? (
        <div className="panel">
          {looksLikeMissingTables(loadError) && (
            <p role="status" className="notice">
              Exercises aren’t set up in the database yet. Run <code>0007_exercises.sql</code> in the Supabase SQL Editor,
              then refresh.
            </p>
          )}
          <p role="alert" className="form-error">{loadError}</p>
          <button type="button" className="outline" onClick={() => void load()}>Try again</button>
        </div>
      ) : exercises === undefined ? (
        <p className="loading">Loading exercises…</p>
      ) : exercises.length === 0 ? (
        <div className="panel">
          <h2>No exercises yet</h2>
          <p className="stat-note">Add your first exercise, or run <code>seed-exercises.sql</code> for a starter list.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="loading">No exercises match your search.</p>
      ) : (
        <>
          <p className="stat-note" aria-live="polite">{shown.length} of {exercises.length} exercises</p>
          <ul className="food-list">
            {shown.map((x) => (
              <li key={x.id} className="panel food-card">
                <div className="food-head">
                  <h2>{x.name}</h2>
                  <span className={`badge ${x.published ? 'on' : ''}`}>{x.published ? 'Published' : 'Draft'}</span>
                </div>
                <p className="stat-note">
                  {[groupName.get(x.muscleGroupId) ?? 'Other', x.equipment || null, DIFFICULTY_LABEL[x.difficulty]]
                    .filter(Boolean).join(' · ')}
                </p>
                <p className="ex-default">{formatDefault(x)}{x.usesWeight ? ' · with weight' : ''}</p>
                {x.tagIds.length > 0 && (
                  <ul className="tags" aria-label="Tags">
                    {x.tagIds.map((id) => tagName.get(id)).filter((n): n is string => !!n).sort()
                      .map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
                <div className="food-actions">
                  <button type="button" className="outline" onClick={() => setEditing(toDraft(x))}>Edit</button>
                  <button type="button" className="outline" onClick={() => void togglePublished(x)}>
                    {x.published ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <ExerciseEditor
          initial={editing}
          groups={groups}
          tags={tags}
          otherNames={(exercises ?? []).filter((x) => x.id !== editing.id).map((x) => x.name)}
          onClose={() => setEditing(undefined)}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
        />
      )}
    </>
  );
}
