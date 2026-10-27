import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Food, UNIT_LABEL, parseNumber } from '../foods/model';
import {
  ACCENTS, MealAccent, MealDraft, TAG_MAX, accentLabel, draftFoodNames, newItem, toPayload, validateMeal,
} from './model';
import { VariantRef, formatTotals, indexVariants, roundKcal, scale, sumItems } from './nutrition';

interface MealEditorProps {
  initial: MealDraft;
  foods: Food[];
  /** False when the database has no hot-meal columns yet: the Hot option is hidden. */
  hotAvailable: boolean;
  onSave: (payload: ReturnType<typeof toPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const MAX_RESULTS = 8;

export function MealEditor({ initial, foods, hotAvailable, onSave, onDelete, onClose }: MealEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => indexVariants(foods), [foods]);
  const isNew = initial.id === undefined;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return foods.filter((f) => f.variants.length > 0 && f.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [foods, search]);

  const patchItem = (key: string, patch: Partial<MealDraft['items'][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  function addFood(food: Food) {
    const variant = food.variants[0];
    setDraft((d) => ({ ...d, items: [...d.items, newItem({ food, variant })] }));
    setSearch('');
  }

  const totals = sumItems(
    draft.items.map((i) => ({ variantId: i.variantId, amount: parseNumber(i.amount) })),
    index,
  );
  const drafts = draft.published ? draftFoodNames(draft.items, index) : [];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Something went wrong. Try again.']);
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateMeal(draft, index);
    setErrors(found);
    if (found.length === 0) void run(() => onSave(toPayload(draft)));
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!window.confirm(`Delete the meal "${initial.name}"? The foods in it are not deleted.`)) return;
    void run(onDelete);
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="meal-editor-title" onSubmit={handleSubmit} noValidate>
        <header className="modal-head">
          <h2 id="meal-editor-title">{isNew ? 'Add meal' : 'Edit meal'}</h2>
          <button type="button" className="link" onClick={onClose} disabled={busy}>Cancel</button>
        </header>

        <div className="modal-body">
          {errors.length > 0 && (
            <ul role="alert" className="form-error error-list">
              {errors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}

          <div className="grid-3">
            <div>
              <label htmlFor="meal-name">Meal name</label>
              <input id="meal-name" ref={nameRef} value={draft.name} maxLength={100}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Chicken rice bowl" />
            </div>
            <div>
              <label htmlFor="meal-tag">Tag</label>
              <input id="meal-tag" value={draft.tag} maxLength={TAG_MAX} placeholder="e.g. High protein"
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })} />
            </div>
            <div>
              <label htmlFor="meal-accent">Card colour</label>
              <select id="meal-accent" value={draft.accent}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value as MealAccent })}>
                {ACCENTS.map((a) => <option key={a} value={a}>{accentLabel(a)}</option>)}
              </select>
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked, isHot: e.target.checked && draft.isHot })} />
            Published (visible in the app)
          </label>
          {hotAvailable && (
            <label className="check">
              <input type="checkbox" checked={draft.isHot} disabled={!draft.published}
                onChange={(e) => setDraft({ ...draft, isHot: e.target.checked })} />
              Hot on Home (shown at the top of the app’s Home screen)
            </label>
          )}
          {drafts.length > 0 && (
            <p className="warn" role="note">Publish these foods first, or untick Published: {drafts.join(', ')}.</p>
          )}

          <h3>Foods</h3>
          <p className="hint">Search your food list and add items. To change a food’s nutrition, edit the food itself.</p>
          <div className="picker">
            <label htmlFor="food-search">Add a food</label>
            <input id="food-search" type="search" autoComplete="off" placeholder="Search foods" value={search}
              onChange={(e) => setSearch(e.target.value)} />
            {search.trim() && (
              matches.length === 0 ? (
                <p className="hint">No foods match “{search.trim()}”.</p>
              ) : (
                <ul className="results" aria-label="Matching foods">
                  {matches.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="result" onClick={() => addFood(f)}>
                        {f.name} <span className="stat-note">{f.published ? '' : '· draft'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          {draft.items.length === 0 && <p className="hint">No foods added yet.</p>}
          {draft.items.map((item) => {
            const ref: VariantRef | undefined = index.get(item.variantId);
            const amount = parseNumber(item.amount);
            return (
              <div key={item.key} className="variant item">
                {ref ? (
                  <>
                    <strong>{ref.food.name}</strong>
                    <div className="grid-3">
                      <div>
                        <label htmlFor={`${item.key}-prep`}>Preparation</label>
                        <select id={`${item.key}-prep`} value={item.variantId}
                          onChange={(e) => patchItem(item.key, { variantId: e.target.value })}>
                          {ref.food.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${item.key}-amount`}>Amount ({UNIT_LABEL[ref.variant.basisUnit]})</label>
                        <input id={`${item.key}-amount`} inputMode="decimal" value={item.amount}
                          onChange={(e) => patchItem(item.key, { amount: e.target.value })} />
                      </div>
                      <p className="item-kcal">
                        {Number.isFinite(amount) && amount > 0 ? `${roundKcal(scale(ref.variant, amount).calories)} kcal` : '–'}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="form-error">This food no longer exists. Remove it.</p>
                )}
                <button type="button" className="link danger"
                  onClick={() => setDraft({ ...draft, items: draft.items.filter((x) => x.key !== item.key) })}>
                  Remove
                </button>
              </div>
            );
          })}

          <p className="totals" aria-live="polite">Total: {formatTotals(totals)}</p>
        </div>

        <footer className="modal-foot">
          {onDelete && <button type="button" className="outline danger" onClick={handleDelete} disabled={busy}>Delete meal</button>}
          <span className="spacer" />
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </footer>
      </form>
    </div>
  );
}
