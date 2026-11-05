-- Fitness Market: 4 starter drinks (Chay / Milk tea, Black tea, Coffee, Latte) built from the starter foods.
-- Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: migration 0009_drinks.sql and seed-foods.sql (Milk, Sugar, Black tea, Coffee) to have been run first.
-- Safe to run again: a drink whose name already exists is skipped, and nothing you made is changed.
-- A milk or sugar food that is not found is left out of the drink (with a message); the drink is still created.

do $seed$
declare
  d jsonb;
  v_sugar uuid;
  v_milks uuid[];
  v_id uuid;
  v_added integer := 0;
  v_skipped integer := 0;
  v_data jsonb := $json$[
    {"n":"Chay / Milk tea","cup":250,"base":1,"milk":true,"milkMl":100,"sugar":true,"tsp":2},
    {"n":"Black tea","cup":250,"base":1,"milk":false,"milkMl":0,"sugar":true,"tsp":1},
    {"n":"Coffee","cup":200,"base":1,"milk":true,"milkMl":50,"sugar":true,"tsp":1},
    {"n":"Latte","cup":300,"base":1,"milk":true,"milkMl":200,"sugar":true,"tsp":1}
  ]$json$;
begin
  select v.id into v_sugar
  from public.food_variants v join public.foods f on f.id = v.food_id
  where lower(f.name) = 'sugar' and lower(v.name) = 'white' and v.basis_unit = 'GRAM' limit 1;
  if v_sugar is null then raise notice 'Sugar (White) was not found; drinks will not ask for sugar until you pick one'; end if;

  select coalesce(array_agg(v.id order by case lower(f.name) when 'milk (whole)' then 0 when 'milk (semi-skimmed)' then 1 else 2 end), '{}')
  into v_milks
  from public.food_variants v join public.foods f on f.id = v.food_id
  where lower(f.name) in ('milk (whole)', 'milk (semi-skimmed)', 'milk (skimmed)') and v.basis_unit = 'MILLILITER';
  if cardinality(v_milks) = 0 then raise notice 'No starter milk was found; drinks will not offer milk until you pick some'; end if;

  for d in select * from jsonb_array_elements(v_data) loop
    if exists (select 1 from public.drinks where lower(btrim(name)) = lower(d ->> 'n')) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_id := public.save_drink(jsonb_build_object(
      'name', d ->> 'n', 'published', true,
      'cup_ml', (d ->> 'cup')::integer, 'base_kcal_per_100ml', (d ->> 'base')::numeric,
      'asks_milk', (d ->> 'milk')::boolean and cardinality(v_milks) > 0,
      'milk_default_ml', (d ->> 'milkMl')::integer,
      'asks_sugar', (d ->> 'sugar')::boolean and v_sugar is not null,
      'sugar_variant_id', v_sugar, 'sugar_default_tsp', (d ->> 'tsp')::numeric,
      'asks_other', true,
      'milk_variant_ids', case when (d ->> 'milk')::boolean then to_jsonb(v_milks) else '[]'::jsonb end
    ));
    v_added := v_added + 1;
  end loop;
  raise notice 'Drinks added: %, already there: %', v_added, v_skipped;
end
$seed$;
