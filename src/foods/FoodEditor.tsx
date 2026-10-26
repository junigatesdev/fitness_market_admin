import { Area } from '../areas/model';
import { Category } from '../categories/model';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  FoodDraft, PREPARATION_SUGGESTIONS, QUANTITY_UNITS, UNIT_LABEL, VariantDraft,
  blankVariant, caloriesLookOff, toPayload, validateDraft,
} from './model';

interface FoodEditorProps {
  initial: FoodDraft;
  categories: Category[];
  areas: Area[];
  onSave: (payload: ReturnType<typeof toPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function FoodEditor({ initial, categories, areas, onSave, onDelete, onClose }: FoodEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = initial.id === undefined;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const setVariant = (key: string, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));

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
    const found = validateDraft(draft);
    setErrors(found);
    if (found.length === 0) void run(() => onSave(toPayload(draft)));
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!window.confirm(`Delete "${initial.name}" and all its preparations? This cannot be undone.`)) return;
    void run(onDelete);
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" onSubmit={handleSubmit} noValidate>
        <header className="modal-head">
          <h2 id="editor-title">{isNew ? 'Add food' : 'Edit food'}</h2>
          <button type="button" className="link" onClick={onClose} disabled={busy}>Cancel</button>
        </header>

        <div className="modal-body">
          {errors.length > 0 && (
            <ul role="alert" className="form-error error-list">
              {errors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}

          <div className="grid-2">
            <div>
              <label htmlFor="food-name">Food name</label>
              <input id="food-name" ref={nameRef} value={draft.name} maxLength={100}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Chicken breast" />
            </div>
            <div>
              <label htmlFor="food-category">Category</label>
              <select id="food-category" value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="areas">
            <legend>World areas</legend>
            <p className="hint">Which food cultures this food belongs to. Pick as many as fit; leave empty if none.</p>
            {areas.length === 0 ? (
              <p className="hint">No areas yet. Add some on the World areas screen.</p>
            ) : (
              <div className="area-options">
                {areas.map((a) => (
                  <label key={a.id} className="check chip">
                    <input type="checkbox" checked={draft.areaIds.includes(a.id)}
                      onChange={(e) => setDraft({
                        ...draft,
                        areaIds: e.target.checked ? [...draft.areaIds, a.id] : draft.areaIds.filter((id) => id !== a.id),
                      })} />
                    {a.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
            Published (visible in the app)
          </label>

          <h3>Preparations</h3>
          <p className="hint">One row per style, e.g. Raw, Home cooked, Air fried. Pick a suggestion or type any style. Nutrition is for the amount you enter (usually 100 g).</p>
          <datalist id="preparations">
            {PREPARATION_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
          </datalist>

          {draft.variants.map((v, i) => (
            <fieldset key={v.key} className="variant">
              <legend>{v.name.trim() || `Preparation ${i + 1}`}</legend>
              <div className="grid-3">
                <div>
                  <label htmlFor={`${v.key}-name`}>Preparation</label>
                  <input id={`${v.key}-name`} list="preparations" value={v.name}
                    onChange={(e) => setVariant(v.key, { name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`${v.key}-amount`}>Amount</label>
                  <input id={`${v.key}-amount`} inputMode="decimal" value={v.basisAmount}
                    onChange={(e) => setVariant(v.key, { basisAmount: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`${v.key}-unit`}>Unit</label>
                  <select id={`${v.key}-unit`} value={v.basisUnit}
                    onChange={(e) => setVariant(v.key, { basisUnit: e.target.value as VariantDraft['basisUnit'] })}>
                    {QUANTITY_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-4">
                {([
                  ['calories', 'Calories (kcal)'], ['proteinG', 'Protein (g)'], ['carbsG', 'Carbs (g)'], ['fatG', 'Fat (g)'],
                ] as const).map(([field, label]) => (
                  <div key={field}>
                    <label htmlFor={`${v.key}-${field}`}>{label}</label>
                    <input id={`${v.key}-${field}`} inputMode="decimal" value={v[field]}
                      onChange={(e) => setVariant(v.key, { [field]: e.target.value })} />
                  </div>
                ))}
              </div>
              {caloriesLookOff(v) && (
                <p className="warn" role="note">
                  Calories don’t match the protein, carbs and fat entered. Double-check before saving.
                </p>
              )}
              {draft.variants.length > 1 && (
                <button type="button" className="link danger"
                  onClick={() => setDraft({ ...draft, variants: draft.variants.filter((x) => x.key !== v.key) })}>
                  Remove this preparation
                </button>
              )}
            </fieldset>
          ))}

          <button type="button" className="outline" onClick={() => setDraft({ ...draft, variants: [...draft.variants, blankVariant()] })}>
            + Add preparation
          </button>
        </div>

        <footer className="modal-foot">
          {onDelete && <button type="button" className="outline danger" onClick={handleDelete} disabled={busy}>Delete food</button>}
          <span className="spacer" />
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </footer>
      </form>
    </div>
  );
}
