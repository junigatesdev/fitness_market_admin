import { useCallback, useEffect, useMemo, useState } from 'react';
import { listFoods } from '../foods/api';
import { Food } from '../foods/model';
import * as api from './api';
import { MealEditor } from './MealEditor';
import { Meal, MealDraft, accentLabel, blankMeal, draftFoodNames, formatItem, toDraft } from './model';
import { formatTotals, indexVariants, sumItems } from './nutrition';

export function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>();
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MealDraft>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [m, f] = await Promise.all([api.listMeals(), listFoods()]);
      setFoods(f);
      setMeals(m);
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
    return (meals ?? []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.tag.toLowerCase().includes(q));
  }, [meals, search]);

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
        <button type="button" className="primary add" onClick={() => setEditing(blankMeal())}>Add meal</button>
      </div>

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
                <span className={`badge ${m.published ? 'on' : ''}`}>{m.published ? 'Published' : 'Draft'}</span>
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
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <MealEditor
          initial={editing}
          foods={foods}
          onClose={() => setEditing(undefined)}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
        />
      )}
    </>
  );
}
