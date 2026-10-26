import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAreas } from '../areas/api';
import { Area } from '../areas/model';
import { listCategories } from '../categories/api';
import { Category } from '../categories/model';
import * as api from './api';
import { FoodEditor } from './FoodEditor';
import { Food, FoodDraft, blankFood, formatVariant, toDraft } from './model';

export function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areasUnavailable, setAreasUnavailable] = useState(false);
  const [area, setArea] = useState('');
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<FoodDraft>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      // World areas are optional here: if their tables aren't set up yet, foods still load.
      const areasResult = listAreas().then(
        (a) => ({ ok: true as const, a }),
        () => ({ ok: false as const, a: [] as Area[] }),
      );
      const [f, c, a] = await Promise.all([api.listFoods(), listCategories(), areasResult]);
      setCategories(c);
      setAreas(a.a);
      setAreasUnavailable(!a.ok);
      setFoods(f);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load foods.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (foods ?? []).filter(
      (f) =>
        (!category || f.categoryId === category) &&
        (!area || f.areaIds.includes(area)) &&
        (!q || f.name.toLowerCase().includes(q)),
    );
  }, [foods, search, category, area]);

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
          onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Filter by world area" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All world areas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" className="primary add" onClick={() => setEditing(blankFood(categories.find((c) => c.isDefault)?.id ?? categories[0]?.id ?? ''))}>Add food</button>
      </div>

      {areasUnavailable && (
        <p role="status" className="notice">
          World areas aren’t set up in the database yet, so area tags are hidden. Foods still work. To turn them on, run
          <code> 0005_world_areas.sql</code> in the Supabase SQL Editor, then refresh.
        </p>
      )}

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
                <p className="stat-note">{categoryName.get(f.categoryId) ?? 'Uncategorised'}</p>
                {f.areaIds.length > 0 && (
                  <ul className="tags" aria-label="World areas">
                    {f.areaIds.map((id) => areaName.get(id)).filter((n): n is string => !!n).sort().map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
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
          categories={categories}
          areas={areas}
          onClose={() => setEditing(undefined)}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
        />
      )}
    </>
  );
}
