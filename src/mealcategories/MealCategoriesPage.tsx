import { FormEvent, useCallback, useEffect, useState } from 'react';
import * as api from './api';
import { MealCategory, moveItem, validateCategoryName } from './model';

export function MealCategoriesPage() {
  const [categories, setCategories] = useState<MealCategory[]>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      setCategories(await api.listMealCategories());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load meal categories.');
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
    const problem = validateCategoryName(newName, list.map((a) => a.name));
    if (problem) return setActionError(problem);
    const next = Math.max(0, ...list.map((a) => a.sortOrder)) + 1;
    if (await change(() => api.addMealCategory(newName, next))) setNewName('');
  }

  async function handleRename(a: MealCategory) {
    const others = (categories ?? []).filter((x) => x.id !== a.id).map((x) => x.name);
    const problem = validateCategoryName(editName, others);
    if (problem) return setActionError(problem);
    if (await change(() => api.renameMealCategory(a.id, editName))) setEditingId(undefined);
  }

  function handleDelete(a: MealCategory) {
    const where = a.mealCount > 0 ? ` It will be removed from its ${a.mealCount} meal${a.mealCount === 1 ? '' : 's'}; the meals are kept.` : '';
    if (!window.confirm(`Delete the category “${a.name}”?${where}`)) return;
    void change(() => api.deleteMealCategory(a.id));
  }

  function handleMove(a: MealCategory, direction: -1 | 1) {
    const list = categories ?? [];
    const ids = moveItem(list, list.findIndex((x) => x.id === a.id), direction).map((x) => x.id);
    void change(() => api.reorderMealCategories(ids));
  }

  if (loadError) {
    return (
      <div className="panel">
        <p role="alert" className="form-error">{loadError}</p>
        {loadError.includes('meal_categories') && (
          <p className="hint">
            Meal categories aren’t set up in the database yet. Run <code>0011_meal_categories.sql</code> in the Supabase SQL
            Editor, then refresh.
          </p>
        )}
        <button type="button" className="outline" onClick={() => void load()}>Try again</button>
      </div>
    );
  }
  if (categories === undefined) return <p className="loading">Loading meal categories…</p>;

  return (
    <>
      <form className="toolbar" onSubmit={handleAdd} noValidate>
        <input aria-label="New category name" placeholder="New category, e.g. Vegetarian" value={newName} maxLength={60}
          onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="primary add" disabled={busy}>Add category</button>
      </form>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {categories.length === 0 ? (
        <div className="panel">
          <h2>No categories yet</h2>
          <p className="stat-note">Add categories such as High protein, Western or Indian, then tag meals with them.</p>
        </div>
      ) : (
        <ul className="panel cat-list">
          {categories.map((a, i) => (
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
                  <span className="stat-note">{a.mealCount} {a.mealCount === 1 ? 'meal' : 'meals'}</span>
                  <span className="cat-actions">
                    <button type="button" className="icon-btn" aria-label={`Move ${a.name} up`}
                      disabled={busy || i === 0} onClick={() => handleMove(a, -1)}>▲</button>
                    <button type="button" className="icon-btn" aria-label={`Move ${a.name} down`}
                      disabled={busy || i === categories.length - 1} onClick={() => handleMove(a, 1)}>▼</button>
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
      <p className="hint">These are the rows on the app’s Meals screen, in this order. A meal can be in several categories (for example Chicken tikka: High protein and Indian). Deleting a category only removes the tag, never the meals.</p>
    </>
  );
}
