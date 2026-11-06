-- Fitness Market: tea and coffee drinks as normal foods, so they show in the Foods list and the app finds them in
-- search ("tea", "chay", "coffee", "latte"). Each preparation is per 100 ml, with one "cup" as its piece size, so the
-- customer can also type "1 cup". The calories are worked out from the starter milk and sugar (a cup of chay = 100 ml
-- milk + 150 ml tea + sugar; 1 teaspoon of sugar = 4 g). Approximate values, review before relying on them.
-- Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: migration 0010_piece_sizes.sql and seed-foods.sql to have been run first.
-- Safe to run again: a food whose name already exists is skipped, and nothing you made is changed.
-- The Drinks screen (cup size, milk, sugar) stays as it is; this only adds the same drinks to search.

do $seed$
declare
  d jsonb;
  v_added integer := 0;
  v_skipped integer := 0;
  v_category uuid := coalesce(
    (select id from public.categories where lower(name) = 'beverages' limit 1),
    (select id from public.categories where is_default)
  );
  -- name, cup size in ml, preparations: [name, kcal, protein, carbs, fat] per 100 ml
  v_data jsonb := $json$[
    {"n":"Milk tea (chay)","cup":250,"v":[
      ["No sugar",25,1.3,1.9,1.3],["1 tsp sugar",31,1.3,3.5,1.3],["2 tsp sugar",37,1.3,5.1,1.3],["3 tsp sugar",44,1.3,6.7,1.3]]},
    {"n":"Milk coffee","cup":200,"v":[
      ["No sugar",16,0.8,1.2,0.8],["1 tsp sugar",24,0.8,3.2,0.8],["2 tsp sugar",32,0.8,5.2,0.8]]},
    {"n":"Latte","cup":300,"v":[
      ["No sugar",41,2.1,3.2,2.2],["1 tsp sugar",45,2.1,4.5,2.2]]}
  ]$json$;
begin
  for d in select * from jsonb_array_elements(v_data) loop
    if exists (select 1 from public.foods where lower(btrim(name)) = lower(d ->> 'n')) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public.save_food(jsonb_build_object(
      'name', d ->> 'n', 'category_id', v_category, 'published', true,
      'variants', (
        select jsonb_agg(jsonb_build_object(
          'name', p ->> 0, 'basis_amount', 100, 'basis_unit', 'MILLILITER',
          'calories', (p ->> 1)::numeric, 'protein_g', (p ->> 2)::numeric, 'carbs_g', (p ->> 3)::numeric, 'fat_g', (p ->> 4)::numeric,
          'piece_name', 'cup', 'piece_amount', (d ->> 'cup')::numeric
        ))
        from jsonb_array_elements(d -> 'v') p
      )
    ));
    v_added := v_added + 1;
  end loop;
  raise notice 'Drink foods added: %, already there: %', v_added, v_skipped;
end
$seed$;
