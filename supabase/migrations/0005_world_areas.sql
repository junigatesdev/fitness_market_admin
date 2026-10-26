-- World areas: tag each food with the food cultures it belongs to (Western, Eastern, South Asian, ...).
-- A managed list (like categories) and a food can carry several areas, like tags.
-- Run after 0001-0004: SQL Editor > New query > paste > Run.

create table public.world_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index world_areas_name_key on public.world_areas (lower(btrim(name)));
create trigger world_areas_updated_at before update on public.world_areas
  for each row execute function public.set_updated_at();

-- Starting list. Rename, reorder, add or delete in the portal.
insert into public.world_areas (name, sort_order) values
  ('Global', 1), ('Western', 2), ('Eastern', 3), ('South Asian', 4), ('Middle Eastern', 5),
  ('Mediterranean', 6), ('African', 7), ('Latin American', 8);

-- Deleting an area just removes the tag from its foods; the foods themselves are never deleted.
create table public.food_world_areas (
  food_id uuid not null references public.foods (id) on delete cascade,
  area_id uuid not null references public.world_areas (id) on delete cascade,
  primary key (food_id, area_id)
);
create index food_world_areas_area_idx on public.food_world_areas (area_id);

alter table public.world_areas enable row level security;
alter table public.food_world_areas enable row level security;

create policy "areas read" on public.world_areas
  for select to anon, authenticated using (true);
create policy "areas admin insert" on public.world_areas
  for insert to authenticated with check (public.is_admin());
create policy "areas admin update" on public.world_areas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "areas admin delete" on public.world_areas
  for delete to authenticated using (public.is_admin());

-- A tag is visible whenever its food is (the foods policy applies inside this subquery).
create policy "food areas read" on public.food_world_areas
  for select to anon, authenticated using (exists (select 1 from public.foods f where f.id = food_id));
create policy "food areas admin insert" on public.food_world_areas
  for insert to authenticated with check (public.is_admin());
create policy "food areas admin delete" on public.food_world_areas
  for delete to authenticated using (public.is_admin());

grant select on public.world_areas, public.food_world_areas to anon;
grant select, insert, update, delete on public.world_areas to authenticated;
grant select, insert, delete on public.food_world_areas to authenticated;

-- Sets the display order to the order of the ids given.
create or replace function public.reorder_world_areas(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.world_areas w set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where w.id = o.id;
$$;
revoke execute on function public.reorder_world_areas(uuid[]) from public, anon;
grant execute on function public.reorder_world_areas(uuid[]) to authenticated;

-- save_food again, now also saving world-area tags. When the payload has an "area_ids" array the food's tags are
-- replaced by exactly that list; when it is absent the tags are left alone.
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
