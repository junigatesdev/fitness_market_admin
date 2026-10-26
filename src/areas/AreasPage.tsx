import { FormEvent, useCallback, useEffect, useState } from 'react';
import * as api from './api';
import { Area, moveItem, validateAreaName } from './model';

export function AreasPage() {
  const [areas, setAreas] = useState<Area[]>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      setAreas(await api.listAreas());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load world areas.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    const list = areas ?? [];
    const problem = validateAreaName(newName, list.map((a) => a.name));
    if (problem) return setActionError(problem);
    const next = Math.max(0, ...list.map((a) => a.sortOrder)) + 1;
    if (await change(() => api.addArea(newName, next))) setNewName('');
  }

  async function handleRename(a: Area) {
    const others = (areas ?? []).filter((x) => x.id !== a.id).map((x) => x.name);
    const problem = validateAreaName(editName, others);
    if (problem) return setActionError(problem);
    if (await change(() => api.renameArea(a.id, editName))) setEditingId(undefined);
  }

  function handleDelete(a: Area) {
    const where = a.foodCount > 0 ? ` It will be removed from its ${a.foodCount} food${a.foodCount === 1 ? '' : 's'}; the foods are kept.` : '';
    if (!window.confirm(`Delete the area “${a.name}”?${where}`)) return;
    void change(() => api.deleteArea(a.id));
  }

  function handleMove(a: Area, direction: -1 | 1) {
    const list = areas ?? [];
    const ids = moveItem(list, list.findIndex((x) => x.id === a.id), direction).map((x) => x.id);
    void change(() => api.reorderAreas(ids));
  }

  if (loadError) {
    return (
      <div className="panel">
        <p role="alert" className="form-error">{loadError}</p>
        <button type="button" className="outline" onClick={() => void load()}>Try again</button>
      </div>
    );
  }
  if (areas === undefined) return <p className="loading">Loading world areas…</p>;

  return (
    <>
      <form className="toolbar" onSubmit={handleAdd} noValidate>
        <input aria-label="New area name" placeholder="New area, e.g. East Asian" value={newName} maxLength={60}
          onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="primary add" disabled={busy}>Add area</button>
      </form>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {areas.length === 0 ? (
        <div className="panel">
          <h2>No areas yet</h2>
          <p className="stat-note">Add areas such as Western, Eastern or Middle Eastern, then tag foods with them.</p>
        </div>
      ) : (
        <ul className="panel cat-list">
          {areas.map((a, i) => (
            <li key={a.id} className="cat-row">
              {editingId === a.id ? (
                <>
                  <input aria-label={`Rename ${a.name}`} value={editName} maxLength={60} autoFocus
                    onChange={(e) => setEditName(e.target.value)} />
                  <button type="button" className="outline" disabled={busy} onClick={() => void handleRename(a)}>Save</button>
                  <button type="button" className="link" onClick={() => { setEditingId(undefined); setActionError(undefined); }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="cat-name">{a.name}</span>
                  <span className="stat-note">{a.foodCount} {a.foodCount === 1 ? 'food' : 'foods'}</span>
                  <span className="cat-actions">
                    <button type="button" className="icon-btn" aria-label={`Move ${a.name} up`}
                      disabled={busy || i === 0} onClick={() => handleMove(a, -1)}>▲</button>
                    <button type="button" className="icon-btn" aria-label={`Move ${a.name} down`}
                      disabled={busy || i === areas.length - 1} onClick={() => handleMove(a, 1)}>▼</button>
                    <button type="button" className="outline" onClick={() => { setEditingId(a.id); setEditName(a.name); setActionError(undefined); }}>
                      Rename
                    </button>
                    <button type="button" className="outline danger" disabled={busy} onClick={() => handleDelete(a)}>Delete</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">A food can carry several areas, like tags (for example Paneer: South Asian and Eastern). Deleting an area only removes the tag, never the foods.</p>
    </>
  );
}
