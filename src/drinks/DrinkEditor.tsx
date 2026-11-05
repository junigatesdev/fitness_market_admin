import { FormEvent, useMemo, useState } from 'react';
import { Food } from '../foods/model';
import { DrinkDraft, parseQuick, summarize, toPayload, validateDraft, num } from './model';

interface DrinkEditorProps {
  initial: DrinkDraft;
  foods: Food[];
  /** Names of the other drinks, for the duplicate-name check. */
  otherNames: string[];
  onSave: (payload: ReturnType<typeof toPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

interface Choice {
  id: string;
  label: string;
  published: boolean;
}

/** Food preparations measured in [unit], as "Milk (whole) · Plain". */
function choices(foods: Food[], unit: 'MILLILITER' | 'GRAM'): Choice[] {
  return foods
    .flatMap((f) => f.variants.filter((v) => v.basisUnit === unit).map((v) => ({ id: v.id, label: `${f.name} · ${v.name}`, published: f.published })))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function DrinkEditor({ initial, foods, otherNames, onSave, onDelete, onClose }: DrinkEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isNew = initial.id === undefined;

  const milks = useMemo(() => choices(foods, 'MILLILITER'), [foods]);
  const sugars = useMemo(() => choices(foods, 'GRAM'), [foods]);
  const byId = useMemo(() => new Map([...milks, ...sugars].map((c) => [c.id, c])), [milks, sugars]);
  const set = <K extends keyof DrinkDraft>(key: K, value: DrinkDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

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
    const found = validateDraft(draft, otherNames);
    setErrors(found);
    if (found.length === 0) void run(() => onSave(toPayload(draft)));
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!window.confirm(`Delete the drink "${initial.name}"? Drinks customers already logged are not changed.`)) return;
    void run(onDelete);
  }

  const toggleMilk = (id: string) =>
    set('milkVariantIds', draft.milkVariantIds.includes(id) ? draft.milkVariantIds.filter((m) => m !== id) : [...draft.milkVariantIds, id]);

  const unpublishedPicked = [...draft.milkVariantIds, draft.sugarVariantId].filter((id) => id && byId.get(id)?.published === false);
  const tspKcal = (() => {
    // A rough guide for the admin: calories of one teaspoon, from the chosen sugar food's own numbers.
    for (const f of foods) {
      const v = f.variants.find((x) => x.id === draft.sugarVariantId);
      if (v && v.basisAmount > 0) return Math.round((v.calories / v.basisAmount) * (num(draft.tspGrams) || 0));
    }
    return undefined;
  })();

  return (
    <form className="editor-page" aria-label="Drink editor" onSubmit={handleSubmit} noValidate>
      <header className="editor-head">
        <button type="button" className="link" onClick={onClose} disabled={busy}>← Drinks</button>
        <h2>{isNew ? 'New drink' : initial.name}</h2>
        <span className="spacer" />
        {onDelete && <button type="button" className="outline danger" onClick={handleDelete} disabled={busy}>Delete</button>}
        <button type="submit" className="primary save" disabled={busy}>{busy ? 'Saving…' : 'Save drink'}</button>
      </header>

      {errors.length > 0 && <ul role="alert" className="form-error error-list">{errors.map((m) => <li key={m}>{m}</li>)}</ul>}

      <div className="editor-grid">
        <div className="editor-col">
          <section className="panel editor-card" aria-label="Drink">
            <h3>Drink</h3>
            <label htmlFor="drink-name">Name</label>
            <input id="drink-name" value={draft.name} maxLength={40} placeholder="e.g. Chay / Milk tea" onChange={(e) => set('name', e.target.value)} />
            <label htmlFor="drink-cup">Usual cup size (ml)</label>
            <input id="drink-cup" inputMode="numeric" value={draft.cupMl} onChange={(e) => set('cupMl', e.target.value)} />
            <label htmlFor="drink-base">Calories of the tea or coffee itself (kcal per 100 ml)</label>
            <input id="drink-base" inputMode="decimal" value={draft.baseKcalPer100ml} onChange={(e) => set('baseKcalPer100ml', e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />
              Published (shown in the app)
            </label>
          </section>

          <section className="panel editor-card" aria-label="Anything else">
            <h3>Anything else?</h3>
            <label className="check">
              <input type="checkbox" checked={draft.asksOther} onChange={(e) => set('asksOther', e.target.checked)} />
              Asks for “anything else” (a name and calories the customer types, e.g. honey 20 kcal)
            </label>
          </section>
        </div>

        <div className="editor-col">
          <section className="panel editor-card" aria-label="Milk">
            <h3>Milk</h3>
            <label className="check">
              <input type="checkbox" checked={draft.asksMilk} onChange={(e) => set('asksMilk', e.target.checked)} />
              Asks for milk
            </label>
            {draft.asksMilk && (
              <>
                <label htmlFor="drink-milk-default">Starting amount (ml)</label>
                <input id="drink-milk-default" inputMode="numeric" value={draft.milkDefaultMl} onChange={(e) => set('milkDefaultMl', e.target.value)} />
                <label htmlFor="drink-milk-quick">Quick amounts (ml, separated by commas)</label>
                <input id="drink-milk-quick" value={draft.milkQuickMl} onChange={(e) => set('milkQuickMl', e.target.value)} />
                <p className="hint">Buttons shown: {parseQuick(draft.milkQuickMl).join(' · ') || 'none'}</p>
                <p className="field-label">Milk choices</p>
                <p className="hint">Foods measured in ml. The first one ticked is the starting choice.</p>
                {milks.length === 0 && <p className="hint">No foods measured in ml yet. Add one in Foods, e.g. Milk.</p>}
                <ul className="pick-list">
                  {milks.map((m) => (
                    <li key={m.id} className="pick-row">
                      <label className="check">
                        <input type="checkbox" checked={draft.milkVariantIds.includes(m.id)} onChange={() => toggleMilk(m.id)} />
                        {m.label}{!m.published && <span className="badge"> Draft</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="panel editor-card" aria-label="Sugar">
            <h3>Sugar</h3>
            <label className="check">
              <input type="checkbox" checked={draft.asksSugar} onChange={(e) => set('asksSugar', e.target.checked)} />
              Asks for sugar
            </label>
            {draft.asksSugar && (
              <>
                <label htmlFor="drink-sugar">Sugar food (measured in grams)</label>
                <select id="drink-sugar" value={draft.sugarVariantId} onChange={(e) => set('sugarVariantId', e.target.value)}>
                  <option value="">Choose…</option>
                  {sugars.map((s) => <option key={s.id} value={s.id}>{s.label}{s.published ? '' : ' (draft)'}</option>)}
                </select>
                <label htmlFor="drink-tsp">Starting amount (teaspoons)</label>
                <input id="drink-tsp" inputMode="decimal" value={draft.sugarDefaultTsp} onChange={(e) => set('sugarDefaultTsp', e.target.value)} />
                <label htmlFor="drink-tsp-g">One teaspoon weighs (g)</label>
                <input id="drink-tsp-g" inputMode="decimal" value={draft.tspGrams} onChange={(e) => set('tspGrams', e.target.value)} />
                {tspKcal !== undefined && <p className="hint">One teaspoon ≈ {tspKcal} kcal with this sugar.</p>}
              </>
            )}
          </section>

          {unpublishedPicked.length > 0 && (
            <p role="status" className="notice">A food picked here is still a draft. The app cannot see drafts, so it skips them until the food is published.</p>
          )}
          <section className="panel editor-card" aria-label="Preview">
            <h3>Preview in the app</h3>
            <p className="hint">{summarize({ cupMl: num(draft.cupMl) || 0, asksMilk: draft.asksMilk, asksSugar: draft.asksSugar, asksOther: draft.asksOther })}.</p>
          </section>
        </div>
      </div>
    </form>
  );
}
