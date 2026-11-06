-- Fitness Market: piece sizes for common starter foods (one egg white = 33 g, one roti = 40 g ...), so the app offers
-- Pieces as well as Grams for them. Approximate reference values, review before relying on them.
-- Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: migration 0010_piece_sizes.sql and seed-foods.sql to have been run first.
-- Safe to run again: a preparation that already has a piece size (yours or from an earlier run) is never changed.

do $seed$
declare
  r record;
  v_set integer := 0;
  -- food, preparation, what one piece is called, size in the preparation's unit (g, or ml for drinks)
  v_data jsonb := $json$[
    ["Egg white", "Raw", "egg white", 33],
    ["Egg", "Raw", "egg", 50],
    ["Egg", "Boiled", "egg", 50],
    ["Egg", "Fried", "egg", 46],
    ["Roti (chapati)", "Whole wheat, no oil", "roti", 40],
    ["Naan", "Plain", "naan", 90],
    ["Almonds", "Raw", "almond", 1.2],
    ["Almonds", "Dry roasted", "almond", 1.2],
    ["Cashews", "Raw", "cashew", 1.6],
    ["Dates", "Dried (Medjool)", "date", 24],
    ["Milk (whole)", "Plain", "glass", 250],
    ["Milk (semi-skimmed)", "Plain", "glass", 250],
    ["Milk (skimmed)", "Plain", "glass", 250],
    ["Orange juice", "Plain", "glass", 250],
    ["Water", "Plain", "glass", 250]
  ]$json$;
begin
  for r in select e ->> 0 as food, e ->> 1 as prep, e ->> 2 as piece, (e ->> 3)::numeric as amount
           from jsonb_array_elements(v_data) e loop
    update public.food_variants v
       set piece_name = r.piece, piece_amount = r.amount
      from public.foods f
     where f.id = v.food_id and lower(f.name) = lower(r.food) and lower(v.name) = lower(r.prep)
       and v.basis_unit in ('GRAM', 'MILLILITER') and v.piece_name is null;
    if found then v_set := v_set + 1; end if;
  end loop;
  raise notice 'Piece sizes added: %', v_set;
end
$seed$;
