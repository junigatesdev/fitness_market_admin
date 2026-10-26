import { FormEvent, useCallback, useEffect, useState } from 'react';
import * as api from './api';
import { Category, moveItem, validateCategoryName } from './model';

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      setCategories(await api.listCategories());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load categories.');
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
    const list = categories ?? [];
    const problem = validateCategoryName(newName, list.map((c) => c.name));
    if (problem) return setActionError(problem);
    const next = Math.max(0, ...list.map((c) => c.sortOrder)) + 1;
    if (await change(() => api.addCategory(newName, next))) setNewName('');
  }

  async function handleRename(c: Category) {
    const others = (categories ?? []).filter((x) => x.id !== c.id).map((x) => x.name);
    const problem = validateCategoryName(editName, others);
    if (problem) return setActionError(problem);
    if (await change(() => api.renameCategory(c.id, editName))) setEditingId(undefined);
  }

  function handleDelete(c: Category) {
    const where = c.foodCount > 0 ? ` Its ${c.foodCount} food${c.foodCount === 1 ? '' : 's'} will move to “Food”.` : '';
    if (!window.confirm(`Delete the category “${c.name}”?${where}`)) return;
    void change(() => api.deleteCategory(c.id));
  }

  function handleMove(c: Category, direction: -1 | 1) {
    const movable = (categories ?? []).filter((x) => !x.isDefault);
    const moved = moveItem(movable, movable.findIndex((x) => x.id === c.id), direction);
    const ids = [...(categories ?? []).filter((x) => x.isDefault), ...moved].map((x) => x.id);
    void change(() => api.reorderCategories(ids));
  }

  if (loadError) {
    return (
      <div className="panel">
        <p role="alert" className="form-error">{loadError}</p>
        <button type="button" className="outline" onClick={() => void load()}>Try again</button>
      </div>
    );
  }
  if (categories === undefined) return <p className="loading">Loading categories…</p>;

  const movable = categories.filter((c) => !c.isDefault);

  return (
    <>
      <form className="toolbar" onSubmit={handleAdd} noValidate>
        <input aria-label="New category name" placeholder="New category, e.g. Fruits" value={newName} maxLength={60}
          onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="primary add" disabled={busy}>Add category</button>
      </form>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      <ul className="panel cat-list">
        {categories.map((c) => {
          const pos = movable.findIndex((x) => x.id === c.id);
          return (
            <li key={c.id} className="cat-row">
              {editingId === c.id ? (
                <>
                  <input aria-label={`Rename ${c.name}`} value={editName} maxLength={60} autoFocus
                    onChange={(e) => setEditName(e.target.value)} />
                  <button type="button" className="outline" disabled={busy} onClick={() => void handleRename(c)}>Save</button>
                  <button type="button" className="link" onClick={() => { setEditingId(undefined); setActionError(undefined); }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="cat-name">
                    {c.name} {c.isDefault && <span className="badge on">Default</span>}
                  </span>
                  <span className="stat-note">{c.foodCount} {c.foodCount === 1 ? 'food' : 'foods'}</span>
                  <span className="cat-actions">
                    {!c.isDefault && (
                      <>
                        <button type="button" className="icon-btn" aria-label={`Move ${c.name} up`}
                          disabled={busy || pos <= 0} onClick={() => handleMove(c, -1)}>▲</button>
                        <button type="button" className="icon-btn" aria-label={`Move ${c.name} down`}
                          disabled={busy || pos === movable.length - 1} onClick={() => handleMove(c, 1)}>▼</button>
                      </>
                    )}
                    <button type="button" className="outline" onClick={() => { setEditingId(c.id); setEditName(c.name); setActionError(undefined); }}>
                      Rename
                    </button>
                    {!c.isDefault && (
                      <button type="button" className="outline danger" disabled={busy} onClick={() => handleDelete(c)}>Delete</button>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint">“Food” is the generic default: new foods start there, and it can’t be deleted. Deleting another category moves its foods to “Food”.</p>
    </>
  );
}
