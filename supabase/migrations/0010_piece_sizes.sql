-- Piece size for a preparation: "one egg white = 33 g". With it the app offers Pieces as well as Grams for that
-- preparation: the customer enters 2 egg white, the app counts 2 x 33 g = 66 g and works out the calories from the
-- nutrition per 100 g. Optional: preparations without a piece size only offer their usual amount.
-- Run after 0001-0009: SQL Editor > paste > Run.
--
-- piece_amount is in the preparation's own unit (grams, or millilitres for a drink such as "1 glass = 250 ml"), and is
-- only allowed on preparations measured in GRAM or MILLILITER. piece_name is what one piece is called ("egg white",
-- "slice", "glass"); both are set or both are empty.

alter table public.food_variants
  add column if not exists piece_name text,
  add column if not exists piece_amount numeric;

alter table public.food_variants
  drop constraint if exists food_variants_piece_check;
alter table public.food_variants
  add constraint food_variants_piece_check check (
    (piece_name is null and piece_amount is null)
    or (
      piece_name is not null and piece_amount is not null
      and char_length(btrim(piece_name)) between 1 and 30
      and piece_amount > 0 and piece_amount <= 5000
      and basis_unit in ('GRAM', 'MILLILITER')
    )
  );

-- save_food again, now also saving the piece size of each preparation (absent in the payload means none).
create or replace function public.save_food(p_food jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_food ->> 'id', '')::uuid, gen_random_uuid());
  v_category uuid := coalesce(
    nullif(p_food ->> 'category_id', '')::uuid,
    (select id from public.categories where is_default)
  );
  v jsonb;
  v_vid uuid;
  v_keep uuid[] := '{}';
  v_used text;
  v_areas uuid[];
  v_piece_name text;
  v_piece_amount numeric;
begin
  if jsonb_array_length(coalesce(p_food -> 'variants', '[]'::jsonb)) = 0 then
    raise exception 'A food needs at least one preparation.';
  end if;

  insert into public.foods (id, name, category_id, published)
  values (v_id, p_food ->> 'name', v_category, coalesce((p_food ->> 'published')::boolean, false))
  on conflict (id) do update
    set name = excluded.name, category_id = excluded.category_id, published = excluded.published;

  for v in select * from jsonb_array_elements(p_food -> 'variants') loop
    v_vid := coalesce(nullif(v ->> 'id', '')::uuid, gen_random_uuid());
    v_keep := v_keep || v_vid;
    v_piece_name := nullif(btrim(v ->> 'piece_name'), '');
    v_piece_amount := nullif(v ->> 'piece_amount', '')::numeric;

    insert into public.food_variants
      (id, food_id, name, basis_amount, basis_unit, calories, protein_g, carbs_g, fat_g, piece_name, piece_amount)
    values (
      v_vid, v_id, v ->> 'name', (v ->> 'basis_amount')::numeric, v ->> 'basis_unit',
      (v ->> 'calories')::numeric, (v ->> 'protein_g')::numeric, (v ->> 'carbs_g')::numeric,
      (v ->> 'fat_g')::numeric, v_piece_name, v_piece_amount
    )
    on conflict (id) do update
      set name = excluded.name, basis_amount = excluded.basis_amount, basis_unit = excluded.basis_unit,
          calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
          fat_g = excluded.fat_g, piece_name = excluded.piece_name, piece_amount = excluded.piece_amount
      where public.food_variants.food_id = excluded.food_id;
  end loop;

  select string_agg(distinct m.name, ', ') into v_used
  from public.meal_items mi
  join public.meals m on m.id = mi.meal_id
  where mi.food_variant_id in (
    select id from public.food_variants where food_id = v_id and id <> all (v_keep)
  );
  if v_used is not null then
    raise exception 'A preparation you removed is used by these meals: %. Remove it from those meals first.', v_used;
  end if;

  delete from public.food_variants where food_id = v_id and id <> all (v_keep);

  if jsonb_typeof(p_food -> 'area_ids') = 'array' then
    v_areas := array(select (a)::uuid from jsonb_array_elements_text(p_food -> 'area_ids') a);
    delete from public.food_world_areas where food_id = v_id and area_id <> all (v_areas);
    insert into public.food_world_areas (food_id, area_id)
    select v_id, a from unnest(v_areas) a
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_food(jsonb) from public, anon;
grant execute on function public.save_food(jsonb) to authenticated;
