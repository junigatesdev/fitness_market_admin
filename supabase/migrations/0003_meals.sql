-- Meals are groups of foods: each item points at a food preparation (food_variants) plus an amount.
-- A meal's calories and macros are always computed from its foods, so editing a food updates every
-- meal that uses it. A food or preparation that a meal uses cannot be deleted (ON DELETE RESTRICT).
-- Run once in Supabase after 0001 and 0002: SQL Editor > New query > paste > Run.

-- Replaces the typed-in "meal ideas" table from 0001, which nothing ever wrote to.
drop table if exists public.meal_ideas;

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  tag text not null default '' check (char_length(tag) <= 40),
  accent text not null default 'GREEN' check (accent in ('GREEN', 'OCEAN', 'BLUE', 'NEUTRAL')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  food_variant_id uuid not null references public.food_variants (id) on delete restrict,
  amount numeric not null check (amount > 0), -- in the preparation's own unit (g, ml, piece, serving)
  position integer not null default 0,
  unique (meal_id, food_variant_id)
);
create index meal_items_variant_idx on public.meal_items (food_variant_id);

create trigger meals_updated_at before update on public.meals
  for each row execute function public.set_updated_at();

alter table public.meals enable row level security;
alter table public.meal_items enable row level security;

create policy "meals read" on public.meals
  for select to anon, authenticated using (published or public.is_admin());
create policy "meals admin insert" on public.meals
  for insert to authenticated with check (public.is_admin());
create policy "meals admin update" on public.meals
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "meals admin delete" on public.meals
  for delete to authenticated using (public.is_admin());

create policy "meal items read" on public.meal_items
  for select to anon, authenticated using (exists (select 1 from public.meals m where m.id = meal_id));
create policy "meal items admin insert" on public.meal_items
  for insert to authenticated with check (public.is_admin());
create policy "meal items admin update" on public.meal_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "meal items admin delete" on public.meal_items
  for delete to authenticated using (public.is_admin());

grant select on public.meals, public.meal_items to anon;
grant select, insert, update, delete on public.meals, public.meal_items to authenticated;

-- Saves a meal and its items in one transaction.
create or replace function public.save_meal(p_meal jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_meal ->> 'id', '')::uuid, gen_random_uuid());
  v_published boolean := coalesce((p_meal ->> 'published')::boolean, false);
  v_draft text;
  it jsonb;
  pos integer := 0;
begin
  if jsonb_array_length(coalesce(p_meal -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'A meal needs at least one food.';
  end if;

  insert into public.meals (id, name, tag, accent, published)
  values (v_id, p_meal ->> 'name', coalesce(p_meal ->> 'tag', ''), p_meal ->> 'accent', v_published)
  on conflict (id) do update
    set name = excluded.name, tag = excluded.tag, accent = excluded.accent, published = excluded.published;

  delete from public.meal_items where meal_id = v_id;
  for it in select * from jsonb_array_elements(p_meal -> 'items') loop
    pos := pos + 1;
    insert into public.meal_items (meal_id, food_variant_id, amount, position)
    values (v_id, (it ->> 'food_variant_id')::uuid, (it ->> 'amount')::numeric, pos);
  end loop;

  -- The app can only read foods that are published, so a published meal may only use published foods.
  if v_published then
    select string_agg(distinct f.name, ', ') into v_draft
    from public.meal_items mi
    join public.food_variants fv on fv.id = mi.food_variant_id
    join public.foods f on f.id = fv.food_id
    where mi.meal_id = v_id and not f.published;
    if v_draft is not null then
      raise exception 'Publish these foods first: %.', v_draft;
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_meal(jsonb) from public, anon;
grant execute on function public.save_meal(jsonb) to authenticated;

-- save_food again, now naming the meals when a removed preparation is still in use.
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
  v_used text;
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
  return v_id;
end;
$$;
