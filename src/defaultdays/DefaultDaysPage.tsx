import { useCallback, useEffect, useState } from 'react';
import { listExercises, listMuscleGroups } from '../exercises/api';
import { Exercise, MuscleGroup } from '../exercises/model';
import * as api from './api';
import { DefaultDayEditor } from './DefaultDayEditor';
import { DayDraft, DefaultDay, blankDay, summarize, toDraft } from './model';
import { moveItem } from '../categories/model';

/** The tables come from migration 0008; until it is run the screen explains what to do instead of failing. */
const looksLikeMissingTables = (message: string) => /default_day|schema cache/i.test(message);

export function DefaultDaysPage() {
  const [days, setDays] = useState<DefaultDay[]>();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [editing, setEditing] = useState<DayDraft>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [d, e, g] = await Promise.all([api.listDays(), listExercises(), listMuscleGroups()]);
      setExercises(e);
      setGroups(g);
      setDays(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load default days.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(action: () => Promise<void>) {
    setActionError(undefined);
    try {
      await action();
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  }

  async function handleSave(payload: Parameters<typeof api.saveDay>[0]) {
    await api.saveDay(payload);
    setEditing(undefined);
    await load();
  }

  async function handleDelete(id: string) {
    await api.deleteDay(id);
    setEditing(undefined);
    await load();
  }

  function handleMove(day: DefaultDay, direction: -1 | 1) {
    const list = days ?? [];
    const moved = moveItem(list, list.findIndex((d) => d.id === day.id), direction);
    void change(() => api.reorderDays(moved.map((d) => d.id)));
  }

  if (editing) {
    return (
      <DefaultDayEditor
        initial={editing}
        exercises={exercises}
        groups={groups}
        otherNames={(days ?? []).filter((d) => d.id !== editing.id).map((d) => d.name)}
        onClose={() => setEditing(undefined)}
        onSave={handleSave}
        onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
      />
    );
  }

  const published = (days ?? []).filter((d) => d.published).length;

  return (
    <>
      <div className="toolbar">
        <p className="hint grow">
          Published days are copied onto each new customer’s phone the first time they open the app. After that they are the
          customer’s own: they can edit or delete them, and later changes here do not reach existing customers.
        </p>
        <button type="button" className="primary add" onClick={() => setEditing(blankDay())}>New default day</button>
      </div>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {loadError ? (
        <div className="panel">
          {looksLikeMissingTables(loadError) && (
            <p role="status" className="notice">
              Default days aren’t set up in the database yet. Run <code>0008_default_days.sql</code> in the Supabase SQL Editor,
              then refresh.
            </p>
          )}
          <p role="alert" className="form-error">{loadError}</p>
          <button type="button" className="outline" onClick={() => void load()}>Try again</button>
        </div>
      ) : days === undefined ? (
        <p className="loading">Loading default days…</p>
      ) : days.length === 0 ? (
        <div className="panel">
          <h2>No default days yet</h2>
          <p className="stat-note">Add one, or run <code>seed-default-days.sql</code> for four starter days.</p>
        </div>
      ) : (
        <>
          <p className="stat-note" aria-live="polite">{days.length} default days · {published} published</p>
          <ul className="ex-list">
            {days.map((d, i) => (
              <li key={d.id} className="panel ex-row day-row">
                <span className="day-pos" aria-hidden="true">{i + 1}</span>
                <div className="ex-main">
                  <h2>{d.name}</h2>
                  <p className="stat-note">{summarize(d)}</p>
                </div>
                <ul className="tags ex-tags" aria-label="Areas">
                  {d.nodes.filter((n) => n.kind === 'group').map((n) => <li key={n.key}>{n.name}</li>)}
                </ul>
                <span className={`badge ${d.published ? 'on' : ''}`}>{d.published ? 'Published' : 'Draft'}</span>
                <div className="food-actions">
                  <button type="button" className="icon-btn" aria-label={`Move ${d.name} up`} disabled={i === 0} onClick={() => handleMove(d, -1)}>▲</button>
                  <button type="button" className="icon-btn" aria-label={`Move ${d.name} down`} disabled={i === days.length - 1} onClick={() => handleMove(d, 1)}>▼</button>
                  <button type="button" className="outline" onClick={() => setEditing(toDraft(d))}>Edit</button>
                  <button type="button" className="outline" onClick={() => void change(() => api.setPublished(d.id, !d.published))}>
                    {d.published ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">The order here is the order customers see them in.</p>
        </>
      )}
    </>
  );
}
