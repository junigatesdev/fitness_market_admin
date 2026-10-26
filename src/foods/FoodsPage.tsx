import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { FoodEditor } from './FoodEditor';
import {
  FOOD_CATEGORIES, Food, FoodCategory, FoodDraft, blankFood, categoryLabel, formatVariant, toDraft,
} from './model';

export function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FoodCategory | ''>('');
  const [editing, setEditing] = useState<FoodDraft>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      setFoods(await api.listFoods());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load foods.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (foods ?? []).filter(
      (f) => (!category || f.category === category) && (!q || f.name.toLowerCase().includes(q)),
    );
  }, [foods, search, category]);

  async function togglePublished(food: Food) {
    setActionError(undefined);
    try {
      await api.setPublished(food.id, !food.published);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update.');
    }
  }

  async function handleSave(payload: Parameters<typeof api.saveFood>[0]) {
    await api.saveFood(payload);
    setEditing(undefined);
    await load();
  }

  async function handleDelete(id: string) {
    await api.deleteFood(id);
    setEditing(undefined);
    await load();
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" aria-label="Search foods" placeholder="Search foods" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by category" value={category}
          onChange={(e) => setCategory(e.target.value as FoodCategory | '')}>
          <option value="">All categories</option>
          {FOOD_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <button type="button" className="primary add" onClick={() => setEditing(blankFood())}>Add food</button>
      </div>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {loadError ? (
        <div className="panel">
          <p role="alert" className="form-error">{loadError}</p>
          <button type="button" className="outline" onClick={() => void load()}>Try again</button>
        </div>
      ) : foods === undefined ? (
        <p className="loading">Loading foods…</p>
      ) : foods.length === 0 ? (
        <div className="panel">
          <h2>No foods yet</h2>
          <p className="stat-note">Add your first food, with a row for each way it’s prepared.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="loading">No foods match your search.</p>
      ) : (
        <>
          <p className="stat-note" aria-live="polite">{shown.length} of {foods.length} foods</p>
          <ul className="food-list">
            {shown.map((f) => (
              <li key={f.id} className="panel food-card">
                <div className="food-head">
                  <h2>{f.name}</h2>
                  <span className={`badge ${f.published ? 'on' : ''}`}>{f.published ? 'Published' : 'Draft'}</span>
                </div>
                <p className="stat-note">{categoryLabel(f.category)}</p>
                <ul className="variants">
                  {f.variants.map((v) => <li key={v.id}>{formatVariant(v)}</li>)}
                </ul>
                <div className="food-actions">
                  <button type="button" className="outline" onClick={() => setEditing(toDraft(f))}>Edit</button>
                  <button type="button" className="outline" onClick={() => void togglePublished(f)}>
                    {f.published ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <FoodEditor
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
        />
      )}
    </>
  );
}
