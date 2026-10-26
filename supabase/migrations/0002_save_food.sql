-- Saves a food and all of its preparations in ONE transaction, so a failed save never leaves a
-- food half-written. Runs with the caller's rights: the row level security rules still apply, so
-- only admins can use it. Run once in Supabase: SQL Editor > New query > paste > Run.

create or replace function public.save_food(p_food jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_food ->> 'id', '')::uuid, gen_random_uuid());
  v jsonb;
  v_vid uuid;
  v_keep uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(p_food -> 'variants', '[]'::jsonb)) = 0 then
    raise exception 'A food needs at least one preparation.';
  end if;

  insert into public.foods (id, name, category, published)
  values (v_id, p_food ->> 'name', p_food ->> 'category', coalesce((p_food ->> 'published')::boolean, false))
  on conflict (id) do update
    set name = excluded.name, category = excluded.category, published = excluded.published;

  for v in select * from jsonb_array_elements(p_food -> 'variants') loop
    v_vid := coalesce(nullif(v ->> 'id', '')::uuid, gen_random_uuid());
    v_keep := v_keep || v_vid;

    insert into public.food_variants
      (id, food_id, name, basis_amount, basis_unit, calories, protein_g, carbs_g, fat_g)
    values (
      v_vid, v_id, v ->> 'name', (v ->> 'basis_amount')::numeric, v ->> 'basis_unit',
      (v ->> 'calories')::numeric, (v ->> 'protein_g')::numeric, (v ->> 'carbs_g')::numeric,
      (v ->> 'fat_g')::numeric
    )
    on conflict (id) do update
      set name = excluded.name, basis_amount = excluded.basis_amount, basis_unit = excluded.basis_unit,
          calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
          fat_g = excluded.fat_g
      where public.food_variants.food_id = excluded.food_id;
  end loop;

  delete from public.food_variants where food_id = v_id and id <> all (v_keep);
  return v_id;
end;
$$;

revoke execute on function public.save_food(jsonb) from public, anon;
grant execute on function public.save_food(jsonb) to authenticated;
