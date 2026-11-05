import { describe, expect, it } from 'vitest';
import { blankDrink, fromRow, num, parseQuick, summarize, toDraft, toPayload, validateDraft } from './model';

const valid = () => ({ ...blankDrink(), name: 'Chay', milkVariantIds: ['m1'], sugarVariantId: 's1' });

describe('parseQuick', () => {
  it('keeps whole numbers above zero, sorted and without repeats', () => {
    expect(parseQuick('150, 50; 100 100 abc -5 2.5 0')).toEqual([50, 100, 150]);
    expect(parseQuick('')).toEqual([]);
  });
});

describe('num', () => {
  it('reads decimals with a point or a comma, and NaN for empty text', () => {
    expect(num('2.5')).toBe(2.5);
    expect(num('2,5')).toBe(2.5);
    expect(Number.isNaN(num('  '))).toBe(true);
  });
});

describe('validateDraft', () => {
  it('accepts a complete drink', () => expect(validateDraft(valid(), [])).toEqual([]));

  it('needs a unique name', () => {
    expect(validateDraft({ ...valid(), name: ' ' }, [])).toContain('Drink name is required.');
    expect(validateDraft(valid(), ['chay'])).toContain('Another drink already has this name.');
    expect(validateDraft({ ...valid(), name: 'x'.repeat(41) }, [])[0]).toMatch(/at most 40/);
  });

  it('checks the cup size and base calories', () => {
    expect(validateDraft({ ...valid(), cupMl: '5' }, []).join()).toMatch(/cup size/);
    expect(validateDraft({ ...valid(), cupMl: '250.5' }, []).join()).toMatch(/cup size/);
    expect(validateDraft({ ...valid(), baseKcalPer100ml: '-1' }, []).join()).toMatch(/itself/);
  });

  it('asks for milk and sugar foods only when the drink asks for them', () => {
    expect(validateDraft({ ...valid(), milkVariantIds: [] }, []).join()).toMatch(/at least one milk/);
    expect(validateDraft({ ...valid(), milkVariantIds: [], asksMilk: false }, [])).toEqual([]);
    expect(validateDraft({ ...valid(), sugarVariantId: '' }, []).join()).toMatch(/sugar food/);
    expect(validateDraft({ ...valid(), sugarVariantId: '', asksSugar: false }, [])).toEqual([]);
    expect(validateDraft({ ...valid(), tspGrams: '0' }, []).join()).toMatch(/teaspoon must weigh/);
  });
});

describe('toPayload', () => {
  it('sends numbers, the quick amounts and the milk choices', () => {
    const p = toPayload({ ...valid(), id: 'd1', name: ' Chay ', milkQuickMl: '100, 50', sugarDefaultTsp: '1,5' });
    expect(p).toMatchObject({
      id: 'd1', name: 'Chay', cup_ml: 250, base_kcal_per_100ml: 0, milk_default_ml: 100, milk_quick_ml: [50, 100],
      milk_variant_ids: ['m1'], sugar_variant_id: 's1', sugar_default_tsp: 1.5, tsp_grams: 4, asks_other: true,
    });
  });

  it('leaves milk and sugar out when the drink does not ask for them', () => {
    const p = toPayload({ ...valid(), asksMilk: false, asksSugar: false });
    expect(p).toMatchObject({ milk_default_ml: 0, milk_variant_ids: [], sugar_variant_id: null, sugar_default_tsp: 0 });
  });
});

describe('rows', () => {
  const row = {
    id: 'd1', name: 'Coffee', sort_order: 3, published: true, cup_ml: 200, base_kcal_per_100ml: 1, asks_milk: true,
    milk_default_ml: 50, milk_quick_ml: [50, 100], asks_sugar: true, sugar_variant_id: 's1', sugar_default_tsp: 1,
    tsp_grams: 4, asks_other: false,
    drink_milks: [{ food_variant_id: 'b', position: 1 }, { food_variant_id: 'a', position: 0 }],
  };

  it('orders the milk choices by position', () => expect(fromRow(row).milkVariantIds).toEqual(['a', 'b']));

  it('round-trips through a draft', () => {
    const drink = fromRow(row);
    expect(toDraft(drink)).toMatchObject({ id: 'd1', cupMl: '200', milkQuickMl: '50, 100', sugarVariantId: 's1', tspGrams: '4' });
  });

  it('summarizes what it asks', () => {
    expect(summarize(fromRow(row))).toBe('200 ml · asks milk, sugar');
    expect(summarize({ cupMl: 250, asksMilk: false, asksSugar: false, asksOther: false })).toBe('250 ml · asks nothing');
  });
});
