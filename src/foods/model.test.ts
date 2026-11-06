import { describe, expect, it } from 'vitest';
import {
  FoodRow, blankFood, blankVariant, caloriesLookOff, formatVariant, fromRow, parseNumber, toDraft,
  toPayload, validateDraft,
} from './model';

const valid = () => {
  const d = blankFood('cat-food');
  d.name = 'Chicken breast';
  d.variants[0] = { ...d.variants[0], name: 'Grilled', calories: '165', proteinG: '31', carbsG: '0', fatG: '3.6' };
  return d;
};

describe('parseNumber', () => {
  it('treats empty and junk as invalid, accepts comma decimals', () => {
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('  ')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('3,6')).toBe(3.6);
    expect(parseNumber('0')).toBe(0);
  });
});

describe('validateDraft', () => {
  it('accepts a valid food', () => expect(validateDraft(valid())).toEqual([]));

  it('accepts zero-calorie foods', () => {
    const d = valid();
    d.variants[0] = { ...d.variants[0], calories: '0', proteinG: '0', carbsG: '0', fatG: '0' };
    expect(validateDraft(d)).toEqual([]);
  });

  it('rejects a blank new food', () => expect(validateDraft(blankFood('cat-food')).length).toBeGreaterThan(0));

  it('rejects long names, negatives, zero amount and duplicates', () => {
    const d = valid();
    d.name = 'x'.repeat(101);
    d.variants = [
      { ...d.variants[0], calories: '-1', basisAmount: '0' },
      { ...blankVariant(), name: 'grilled', calories: '1', proteinG: '1', carbsG: '1', fatG: '1' },
    ];
    const text = validateDraft(d).join('\n');
    expect(text).toContain('at most 100');
    expect(text).toContain('calories must be a number');
    expect(text).toContain('amount must be greater than 0');
    expect(text).toContain('already has this name');
  });

  it('rejects having no preparations', () => {
    const d = valid();
    d.variants = [];
    expect(validateDraft(d)).toContain('Add at least one preparation.');
  });
});

describe('caloriesLookOff', () => {
  it('passes consistent values and flags inconsistent ones', () => {
    expect(caloriesLookOff(valid().variants[0])).toBe(false);
    expect(caloriesLookOff({ ...valid().variants[0], calories: '500' })).toBe(true);
  });
  it('stays quiet while fields are incomplete', () => {
    expect(caloriesLookOff({ ...valid().variants[0], fatG: '' })).toBe(false);
  });
});

describe('payload and mapping', () => {
  it('builds the save_food payload with trimmed text and numbers', () => {
    const d = valid();
    d.name = '  Chicken breast ';
    d.variants[0].fatG = '3,6';
    expect(toPayload(d)).toEqual({
      id: null, name: 'Chicken breast', category_id: 'cat-food', area_ids: [], published: false,
      variants: [{ id: null, name: 'Grilled', basis_amount: 100, basis_unit: 'GRAM', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, piece_name: null, piece_amount: null }],
    });
  });

  const row: FoodRow = {
    id: 'f1', name: 'Corn', category_id: 'cat-veg', published: true,
    food_world_areas: [{ area_id: 'a-south' }, { area_id: 'a-west' }],
    food_variants: [
      { id: 'b', name: 'Raw', basis_amount: 100, basis_unit: 'GRAM', calories: 86, protein_g: 3.3, carbs_g: 19, fat_g: 1.4 },
      { id: 'a', name: 'Boiled', basis_amount: 100, basis_unit: 'GRAM', calories: 96, protein_g: 3.4, carbs_g: 21, fat_g: 1.5 },
    ],
  };

  it('maps rows, sorts preparations by name, and round-trips through a draft', () => {
    const food = fromRow(row);
    expect(food.areaIds).toEqual(['a-south', 'a-west']);
    expect(food.variants.map((v) => v.name)).toEqual(['Boiled', 'Raw']);
    const draft = toDraft(food);
    expect(draft.id).toBe('f1');
    expect(toPayload(draft).area_ids).toEqual(['a-south', 'a-west']);
    expect(toPayload(draft).variants[0]).toMatchObject({ id: 'a', calories: 96, protein_g: 3.4 });
  });

  it('formats labels', () => {
    expect(formatVariant(fromRow(row).variants[0])).toBe('Boiled: 96 kcal per 100 g');
  });
});

describe('piece size', () => {
  const withPiece = (name: string, amount: string, unit: 'GRAM' | 'MILLILITER' | 'PIECE' = 'GRAM') => {
    const d = valid();
    d.variants[0] = { ...d.variants[0], basisUnit: unit, pieceName: name, pieceAmount: amount };
    return d;
  };

  it('is optional', () => expect(validateDraft(valid())).toEqual([]));

  it('is sent with the preparation, and cleared when the name is empty', () => {
    expect(toPayload(withPiece(' egg white ', '33')).variants[0]).toMatchObject({ piece_name: 'egg white', piece_amount: 33 });
    expect(toPayload(withPiece('', '')).variants[0]).toMatchObject({ piece_name: null, piece_amount: null });
  });

  it('accepts a comma decimal and a millilitre preparation', () => {
    const d = withPiece('almond', '1,2');
    expect(validateDraft(d)).toEqual([]);
    expect(toPayload(d).variants[0].piece_amount).toBe(1.2);
    expect(validateDraft(withPiece('glass', '250', 'MILLILITER'))).toEqual([]);
  });

  it('needs both a name and a size above zero', () => {
    expect(validateDraft(withPiece('', '33')).join()).toMatch(/what one piece is called/);
    expect(validateDraft(withPiece('egg white', '')).join()).toMatch(/must weigh/);
    expect(validateDraft(withPiece('egg white', '0')).join()).toMatch(/must weigh/);
    expect(validateDraft(withPiece('egg white', '6000')).join()).toMatch(/must weigh/);
    expect(validateDraft(withPiece('x'.repeat(31), '5')).join()).toMatch(/at most 30/);
  });

  it('is refused on a food counted in pieces or servings', () => {
    expect(validateDraft(withPiece('slice', '30', 'PIECE')).join()).toMatch(/only works for foods measured in g or ml/);
  });

  it('is read from the database row, and absent rows have none', () => {
    const food = fromRow({
      id: 'f', name: 'Egg white', category_id: 'c', published: true,
      food_variants: [
        { id: 'v1', name: 'Raw', basis_amount: 100, basis_unit: 'GRAM', calories: 52, protein_g: 11, carbs_g: 0.7, fat_g: 0.2, piece_name: 'egg white', piece_amount: 33 },
        { id: 'v2', name: 'Boiled', basis_amount: 100, basis_unit: 'GRAM', calories: 50, protein_g: 11, carbs_g: 0.7, fat_g: 0.2, piece_name: null, piece_amount: null },
      ],
    });
    expect(food.variants.find((v) => v.id === 'v1')).toMatchObject({ pieceName: 'egg white', pieceAmount: 33 });
    expect(food.variants.find((v) => v.id === 'v2')?.pieceName).toBeUndefined();
    expect(toDraft(food).variants.map((v) => v.pieceAmount).sort()).toEqual(['', '33']);
  });
});
