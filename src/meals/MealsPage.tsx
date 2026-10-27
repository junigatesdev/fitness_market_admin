import { useCallback, useEffect, useMemo, useState } from 'react';
import { listFoods } from '../foods/api';
import { Food } from '../foods/model';
import * as api from './api';
import { MealEditor } from './MealEditor';
import { Meal, MealDraft, accentLabel, blankMeal, draftFoodNames, formatItem, hotMeals, toDraft } from './model';
import { moveItem } from '../categories/model';
import { formatTotals, indexVariants, sumItems } from './nutrition';

export function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>();
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'hot'>('all');
  const [hotAvailable, setHotAvailable] = useState(true);
  const [editing, setEditing] = useState<MealDraft>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [m, f] = await Promise.all([api.listMeals(), listFoods()]);
      setFoods(f);
      setMeals(m.meals);
      setHotAvailable(m.hotAvailable);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load meals.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const index = useMemo(() => indexVariants(foods), [foods]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = view === 'hot' ? hotMeals(meals ?? []) : (meals ?? []);
    return base.filter((m) => !q || m.name.toLowerCase().includes(q) || m.tag.toLowerCase().includes(q));
  }, [meals, search, view]);

  const hotList = useMemo(() => hotMeals(meals ?? []), [meals]);

  async function toggleHot(meal: Meal) {
    setActionError(undefined);
    try {
      const next = Math.max(0, ...hotList.map((m) => m.hotOrder)) + 1;
      await api.setMealHot(meal.id, !meal.isHot, next);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update.');
    }
  }

  async function moveHot(meal: Meal, direction: -1 | 1) {
    setActionError(undefined);
    try {
      const ids = moveItem(hotList, hotList.findIndex((m) => m.id === meal.id), direction).map((m) => m.id);
      await api.reorderHotMeals(ids);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not reorder.');
    }
  }

  async function togglePublished(meal: Meal) {
    setActionError(undefined);
    if (!meal.published) {
      const drafts = draftFoodNames(meal.items, index);
      if (drafts.length > 0) {
        setActionError(`Publish these foods first: ${drafts.join(', ')}.`);
        return;
      }
    }
    try {
      await api.setMealPublished(meal.id, !meal.published);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update.');
    }
  }

  async function handleSave(payload: Parameters<typeof api.saveMeal>[0]) {
    await api.saveMeal(payload);
    setEditing(undefined);
    await load();
  }

  async function handleDelete(id: string) {
    await api.deleteMeal(id);
    setEditing(undefined);
    await load();
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" aria-label="Search meals" placeholder="Search meals" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        {hotAvailable && (
          <select aria-label="Show meals" value={view} onChange={(e) => setView(e.target.value as 'all' | 'hot')}>
            <option value="all">All meals</option>
            <option value="hot">Hot meals ({hotList.length})</option>
          </select>
        )}
        <button type="button" className="primary add" onClick={() => setEditing(blankMeal())}>Add meal</button>
      </div>

      {!hotAvailable && (
        <p role="status" className="notice">
          Hot meals aren’t set up in the database yet, so the Hot option is hidden. Meals still work. To turn it on, run
          <code> 0006_hot_meals.sql</code> in the Supabase SQL Editor, then refresh.
        </p>
      )}

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {loadError ? (
        <div className="panel">
          <p role="alert" className="form-error">{loadError}</p>
          <button type="button" className="outline" onClick={() => void load()}>Try again</button>
        </div>
      ) : meals === undefined ? (
        <p className="loading">Loading meals…</p>
      ) : meals.length === 0 ? (
        <div className="panel">
          <h2>No meals yet</h2>
          <p className="stat-note">
            {foods.length === 0 ? 'Add some foods first, then build meals from them.' : 'Add your first meal by picking foods from your list.'}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="loading">No meals match your search.</p>
      ) : (
        <ul className="food-list">
          {shown.map((m) => (
            <li key={m.id} className={`panel food-card accent-${m.accent.toLowerCase()}`}>
              <div className="food-head">
                <h2>{m.name}</h2>
                <span>
                  {m.isHot && <span className="badge hot">Hot #{m.hotOrder}</span>}{' '}
                  <span className={`badge ${m.published ? 'on' : ''}`}>{m.published ? 'Published' : 'Draft'}</span>
                </span>
              </div>
              <p className="stat-note">{m.tag || 'No tag'} · {accentLabel(m.accent)}</p>
              <ul className="variants">
                {m.items.map((i) => <li key={i.variantId}>{formatItem(i, index)}</li>)}
              </ul>
              <p className="totals">{formatTotals(sumItems(m.items, index))}</p>
              <div className="food-actions">
                <button type="button" className="outline" onClick={() => setEditing(toDraft(m))}>Edit</button>
                <button type="button" className="outline" onClick={() => void togglePublished(m)}>
                  {m.published ? 'Unpublish' : 'Publish'}
                </button>
                {hotAvailable && m.published && (
                  <button type="button" className="outline" onClick={() => void toggleHot(m)}>
                    {m.isHot ? 'Remove from hot' : 'Make hot'}
                  </button>
                )}
                {view === 'hot' && (
                  <>
                    <button type="button" className="icon-btn" aria-label={`Move ${m.name} earlier`}
                      disabled={hotList[0]?.id === m.id} onClick={() => void moveHot(m, -1)}>▲</button>
                    <button type="button" className="icon-btn" aria-label={`Move ${m.name} later`}
                      disabled={hotList[hotList.length - 1]?.id === m.id} onClick={() => void moveHot(m, 1)}>▼</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <MealEditor
          initial={editing}
          foods={foods}
          hotAvailable={hotAvailable}
          onClose={() => setEditing(undefined)}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
        />
      )}
    </>
  );
}
