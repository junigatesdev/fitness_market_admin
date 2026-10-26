-- Fitness Market admin: COMPLETE database setup in one paste.
-- This is 0001 to 0004 from supabase/migrations joined in order. Run it ONCE on a new project:
-- Supabase > SQL Editor > New query > paste all > Run. (If a warning mentions a destructive query, confirm: it only drops a table this setup creates.)

-- ================================================================
-- 0001_init
-- ================================================================
-- Fitness Market admin: food database and meal ideas.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Shapes mirror the Android app (domain/model/food, MealIdea) so the app can read them later.

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- ----------------------------------------------------------------- foods
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null check (category in (
    'FRUIT', 'VEGETABLE', 'MEAT_AND_POULTRY', 'FISH_AND_SEAFOOD', 'EGGS', 'DAIRY', 'GRAINS_AND_BREAD',
    'LEGUMES', 'NUTS_AND_SEEDS', 'FATS_AND_OILS', 'BEVERAGES', 'SWEETS_AND_SNACKS', 'MIXED_DISHES', 'OTHER'
  )),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per preparation (raw / boiled / fried ...), with nutrition for a stated amount (e.g. per 100 g).
create table public.food_variants (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  basis_amount numeric not null default 100 check (basis_amount > 0),
  basis_unit text not null default 'GRAM' check (basis_unit in ('GRAM', 'MILLILITER', 'PIECE', 'SERVING')),
  calories numeric not null check (calories >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index food_variants_food_name_key on public.food_variants (food_id, lower(btrim(name)));

create index foods_name_idx on public.foods (lower(name));

-- ------------------------------------------------------------ meal ideas
create table public.meal_ideas (
  id uuid primary key default gen_random_uuid(),
  tag text not null check (char_length(btrim(tag)) > 0),
  name text not null check (char_length(btrim(name)) > 0),
  foods text[] not null default '{}',
  calories integer not null check (calories >= 0),
  protein_g integer not null check (protein_g >= 0),
  accent text not null default 'GREEN' check (accent in ('GREEN', 'OCEAN', 'BLUE', 'NEUTRAL')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger foods_updated_at before update on public.foods
  for each row execute function public.set_updated_at();
create trigger food_variants_updated_at before update on public.food_variants
  for each row execute function public.set_updated_at();
create trigger meal_ideas_updated_at before update on public.meal_ideas
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- security
alter table public.admins enable row level security;
alter table public.foods enable row level security;
alter table public.food_variants enable row level security;
alter table public.meal_ideas enable row level security;

-- Admins can see only their own membership row. Nobody can change admins through the API:
-- add admins in the SQL Editor (see the end of this file).
create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- The app (anon) and the portal read published content; admins read everything.
create policy "foods read" on public.foods
  for select to anon, authenticated using (published or public.is_admin());
create policy "foods admin insert" on public.foods
  for insert to authenticated with check (public.is_admin());
create policy "foods admin update" on public.foods
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "foods admin delete" on public.foods
  for delete to authenticated using (public.is_admin());

-- A variant is visible whenever its food is (the foods policy applies inside this subquery).
create policy "variants read" on public.food_variants
  for select to anon, authenticated using (exists (select 1 from public.foods f where f.id = food_id));
create policy "variants admin insert" on public.food_variants
  for insert to authenticated with check (public.is_admin());
create policy "variants admin update" on public.food_variants
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "variants admin delete" on public.food_variants
  for delete to authenticated using (public.is_admin());

create policy "ideas read" on public.meal_ideas
  for select to anon, authenticated using (published or public.is_admin());
create policy "ideas admin insert" on public.meal_ideas
  for insert to authenticated with check (public.is_admin());
create policy "ideas admin update" on public.meal_ideas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ideas admin delete" on public.meal_ideas
  for delete to authenticated using (public.is_admin());

-- Table privileges (row level security above decides which rows).
grant select on public.foods, public.food_variants, public.meal_ideas to anon;
grant select, insert, update, delete on public.foods, public.food_variants, public.meal_ideas to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------- make yourself admin
-- 1. Authentication > Users > Add user (email + password, tick "Auto Confirm User").
-- 2. Replace the email below with that user's email and run this one statement:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'you@example.com';

-- ================================================================
-- 0002_save_food
-- ================================================================
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

-- ================================================================
-- 0003_meals
-- ================================================================
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

-- ================================================================
-- 0004_categories
-- ================================================================
-- Categories become a table you manage in the portal instead of a fixed list.
-- Every food has exactly one category. 'Food' is the generic default: it cannot be deleted, and
-- deleting any other category moves its foods there. Run after 0001-0003: SQL Editor > paste > Run.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(btrim(name)));
create unique index categories_one_default on public.categories (is_default) where is_default;

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create or replace function public.protect_default_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default then raise exception 'The default category cannot be deleted.'; end if;
    return old;
  end if;
  if old.is_default is distinct from new.is_default then
    raise exception 'The default category cannot be changed.';
  end if;
  return new;
end;
$$;
create trigger categories_protect_default before update or delete on public.categories
  for each row execute function public.protect_default_category();

-- Starting list: the generic default, plus the categories the app used before.
insert into public.categories (name, sort_order, is_default) values ('Food', 0, true);
insert into public.categories (name, sort_order) values
  ('Fruit', 1), ('Vegetable', 2), ('Meat & poultry', 3), ('Fish & seafood', 4), ('Eggs', 5), ('Dairy', 6),
  ('Grains & bread', 7), ('Legumes', 8), ('Nuts & seeds', 9), ('Fats & oils', 10), ('Beverages', 11),
  ('Sweets & snacks', 12), ('Mixed dishes', 13);

-- Move existing foods across, then drop the old fixed-list column.
alter table public.foods add column category_id uuid references public.categories (id) on delete restrict;
update public.foods f set category_id = c.id
from public.categories c
where c.name = case f.category
  when 'FRUIT' then 'Fruit' when 'VEGETABLE' then 'Vegetable' when 'MEAT_AND_POULTRY' then 'Meat & poultry'
  when 'FISH_AND_SEAFOOD' then 'Fish & seafood' when 'EGGS' then 'Eggs' when 'DAIRY' then 'Dairy'
  when 'GRAINS_AND_BREAD' then 'Grains & bread' when 'LEGUMES' then 'Legumes'
  when 'NUTS_AND_SEEDS' then 'Nuts & seeds' when 'FATS_AND_OILS' then 'Fats & oils'
  when 'BEVERAGES' then 'Beverages' when 'SWEETS_AND_SNACKS' then 'Sweets & snacks'
  when 'MIXED_DISHES' then 'Mixed dishes' else 'Food' end;
alter table public.foods alter column category_id set not null;
alter table public.foods drop column category;
create index foods_category_idx on public.foods (category_id);

alter table public.categories enable row level security;
create policy "categories read" on public.categories
  for select to anon, authenticated using (true);
create policy "categories admin insert" on public.categories
  for insert to authenticated with check (public.is_admin());
create policy "categories admin update" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "categories admin delete" on public.categories
  for delete to authenticated using (public.is_admin());
grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;

-- Moves the category's foods to the default category, then deletes it, in one transaction.
create or replace function public.delete_category(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_default uuid;
begin
  select id into v_default from public.categories where is_default;
  if p_id = v_default then
    raise exception 'The default category cannot be deleted.';
  end if;
  update public.foods set category_id = v_default where category_id = p_id;
  delete from public.categories where id = p_id;
end;
$$;

-- Sets the display order to the order of the ids given.
create or replace function public.reorder_categories(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.categories c set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where c.id = o.id;
$$;

revoke execute on function public.delete_category(uuid), public.reorder_categories(uuid[]) from public, anon;
grant execute on function public.delete_category(uuid), public.reorder_categories(uuid[]) to authenticated;

-- save_food again, taking category_id (defaults to the generic category when omitted).
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
  return v_id;
end;
$$;

