import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  DIFFICULTIES, DIFFICULTY_LABEL, EQUIPMENT_SUGGESTIONS, ExerciseDraft, ExerciseTag, MuscleGroup,
  toPayload, validateDraft,
} from './model';

interface ExerciseEditorProps {
  initial: ExerciseDraft;
  groups: MuscleGroup[];
  tags: ExerciseTag[];
  /** Names of the other exercises, for the duplicate-name check. */
  otherNames: string[];
  onSave: (payload: ReturnType<typeof toPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function ExerciseEditor({ initial, groups, tags, otherNames, onSave, onDelete, onClose }: ExerciseEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = initial.id === undefined;
  const unit = draft.measure === 'SECONDS' ? 'Seconds' : 'Reps';

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

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
    if (!window.confirm(`Delete "${initial.name}"? This cannot be undone.`)) return;
    void run(onDelete);
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" onSubmit={handleSubmit} noValidate>
        <header className="modal-head">
          <h2 id="editor-title">{isNew ? 'Add exercise' : 'Edit exercise'}</h2>
          <button type="button" className="link" onClick={onClose} disabled={busy}>Cancel</button>
        </header>

        <div className="modal-body">
          {errors.length > 0 && (
            <ul role="alert" className="form-error error-list">
              {errors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}

          <label htmlFor="ex-name">Exercise name</label>
          <input id="ex-name" ref={nameRef} value={draft.name} maxLength={100} placeholder="e.g. Incline dumbbell press"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />

          <div className="grid-2 equal">
            <div>
              <label htmlFor="ex-group">Main muscle group</label>
              <select id="ex-group" value={draft.muscleGroupId}
                onChange={(e) => setDraft({ ...draft, muscleGroupId: e.target.value })}>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ex-equipment">Equipment</label>
              <input id="ex-equipment" list="equipment" value={draft.equipment} maxLength={60}
                onChange={(e) => setDraft({ ...draft, equipment: e.target.value })} />
              <datalist id="equipment">
                {EQUIPMENT_SUGGESTIONS.map((q) => <option key={q} value={q} />)}
              </datalist>
            </div>
          </div>

          <fieldset className="areas">
            <legend>Difficulty</legend>
            <div className="area-options" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <label key={d} className="check chip">
                  <input type="radio" name="difficulty" checked={draft.difficulty === d}
                    onChange={() => setDraft({ ...draft, difficulty: d })} />
                  {DIFFICULTY_LABEL[d]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="areas">
            <legend>Tags</legend>
            <p className="hint">Which workout days this exercise usually belongs to. Pick as many as fit.</p>
            {tags.length === 0 ? (
              <p className="hint">No tags yet. Add some under “Manage groups &amp; tags”.</p>
            ) : (
              <div className="area-options">
                {tags.map((t) => (
                  <label key={t.id} className="check chip">
                    <input type="checkbox" checked={draft.tagIds.includes(t.id)}
                      onChange={(e) => setDraft({
                        ...draft,
                        tagIds: e.target.checked ? [...draft.tagIds, t.id] : draft.tagIds.filter((id) => id !== t.id),
                      })} />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <label htmlFor="ex-howto">How to do it</label>
          <textarea id="ex-howto" rows={4} value={draft.instructions} maxLength={2000}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />

          <h3>Defaults for customers</h3>
          <p className="hint">Customers can change sets, reps and weight for themselves. That never changes these defaults.</p>
          <fieldset className="areas">
            <legend>Measured in</legend>
            <div className="area-options" role="radiogroup" aria-label="Measured in">
              {(['REPS', 'SECONDS'] as const).map((m) => (
                <label key={m} className="check chip">
                  <input type="radio" name="measure" checked={draft.measure === m}
                    onChange={() => setDraft({ ...draft, measure: m })} />
                  {m === 'REPS' ? 'Reps' : 'Seconds'}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid-2 equal">
            <div>
              <label htmlFor="ex-sets">Sets</label>
              <input id="ex-sets" inputMode="numeric" value={draft.defaultSets}
                onChange={(e) => setDraft({ ...draft, defaultSets: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ex-target">{unit}</label>
              <input id="ex-target" inputMode="numeric" value={draft.defaultTarget}
                onChange={(e) => setDraft({ ...draft, defaultTarget: e.target.value })} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={draft.usesWeight}
              onChange={(e) => setDraft({ ...draft, usesWeight: e.target.checked })} />
            Customer logs weight for this exercise
          </label>

          <p className="hint">Pictures and GIFs come later. Every exercise shows the same placeholder image for now.</p>

          <label className="check">
            <input type="checkbox" checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
            Published (visible in the app)
          </label>
        </div>

        <footer className="modal-foot">
          {onDelete && <button type="button" className="outline danger" onClick={handleDelete} disabled={busy}>Delete exercise</button>}
          <span className="spacer" />
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </footer>
      </form>
    </div>
  );
}
