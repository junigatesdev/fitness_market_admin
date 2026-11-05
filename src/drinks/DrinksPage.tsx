import { useCallback, useEffect, useState } from 'react';
import { listFoods } from '../foods/api';
import { Food } from '../foods/model';
import { moveItem } from '../categories/model';
import * as api from './api';
import { DrinkEditor } from './DrinkEditor';
import { Drink, DrinkDraft, blankDrink, summarize, toDraft } from './model';

/** The tables come from migration 0009; until it is run the screen explains what to do instead of failing. */
const looksLikeMissingTables = (message: string) => /drinks|drink_milks|schema cache/i.test(message);

export function DrinksPage() {
  const [drinks, setDrinks] = useState<Drink[]>();
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [editing, setEditing] = useState<DrinkDraft>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [d, f] = await Promise.all([api.listDrinks(), listFoods()]);
      setFoods(f);
      setDrinks(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load drinks.');
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

  async function handleSave(payload: Parameters<typeof api.saveDrink>[0]) {
    await api.saveDrink(payload);
    setEditing(undefined);
    await load();
  }

  async function handleDelete(id: string) {
    await api.deleteDrink(id);
    setEditing(undefined);
    await load();
  }

  function handleMove(drink: Drink, direction: -1 | 1) {
    const list = drinks ?? [];
    const moved = moveItem(list, list.findIndex((d) => d.id === drink.id), direction);
    void change(() => api.reorderDrinks(moved.map((d) => d.id)));
  }

  if (editing) {
    return (
      <DrinkEditor
        initial={editing}
        foods={foods}
        otherNames={(drinks ?? []).filter((d) => d.id !== editing.id).map((d) => d.name)}
        onClose={() => setEditing(undefined)}
        onSave={handleSave}
        onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
      />
    );
  }

  const published = (drinks ?? []).filter((d) => d.published).length;

  return (
    <>
      <div className="toolbar">
        <p className="hint grow">
          Each published drink shows in the app under Add food › Drinks. The customer picks the cup size, milk and sugar; the
          calories are worked out from the milk and sugar foods you choose here.
        </p>
        <button type="button" className="primary add" onClick={() => setEditing(blankDrink())}>New drink</button>
      </div>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}

      {loadError ? (
        <div className="panel">
          {looksLikeMissingTables(loadError) && (
            <p role="status" className="notice">
              Drinks aren’t set up in the database yet. Run <code>0009_drinks.sql</code> in the Supabase SQL Editor, then refresh.
            </p>
          )}
          <p role="alert" className="form-error">{loadError}</p>
          <button type="button" className="outline" onClick={() => void load()}>Try again</button>
        </div>
      ) : drinks === undefined ? (
        <p className="loading">Loading drinks…</p>
      ) : drinks.length === 0 ? (
        <div className="panel">
          <h2>No drinks yet</h2>
          <p className="stat-note">Add one, or run <code>seed-drinks.sql</code> for four starter drinks.</p>
        </div>
      ) : (
        <>
          <p className="stat-note" aria-live="polite">{drinks.length} drinks · {published} published</p>
          <ul className="ex-list">
            {drinks.map((d, i) => (
              <li key={d.id} className="panel ex-row day-row">
                <span className="day-pos" aria-hidden="true">{i + 1}</span>
                <div className="ex-main">
                  <h2>{d.name}</h2>
                  <p className="stat-note">{summarize(d)}</p>
                </div>
                <ul className="tags ex-tags" aria-label="Asks for">
                  {d.asksMilk && <li>Milk</li>}
                  {d.asksSugar && <li>Sugar</li>}
                  {d.asksOther && <li>Other</li>}
                </ul>
                <span className={`badge ${d.published ? 'on' : ''}`}>{d.published ? 'Published' : 'Draft'}</span>
                <div className="food-actions">
                  <button type="button" className="icon-btn" aria-label={`Move ${d.name} up`} disabled={i === 0} onClick={() => handleMove(d, -1)}>▲</button>
                  <button type="button" className="icon-btn" aria-label={`Move ${d.name} down`} disabled={i === drinks.length - 1} onClick={() => handleMove(d, 1)}>▼</button>
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
