-- Fitness Market admin: COMPLETE database setup in one paste.
-- This is 0001 to 0007 from supabase/migrations joined in order. Run it ONCE on a new project:
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

-- ================================================================
-- 0005_world_areas
-- ================================================================
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

-- ================================================================
-- 0006_hot_meals
-- ================================================================
-- Hot meals: choose which published meals the app shows on its Home screen, and in what order.
-- Run after 0001-0005: SQL Editor > New query > paste > Run.

alter table public.meals
  add column is_hot boolean not null default false,
  add column hot_order integer not null default 0;
create index meals_hot_idx on public.meals (hot_order) where is_hot;

-- A meal that is not published cannot be hot (the app cannot see it anyway), so unpublishing clears the flag.
create or replace function public.meals_clear_hot_when_unpublished()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.published then
    new.is_hot := false;
    new.hot_order := 0;
  end if;
  return new;
end;
$$;
create trigger meals_unpublished_not_hot before insert or update on public.meals
  for each row execute function public.meals_clear_hot_when_unpublished();

-- Sets the order of the hot meals to the order of the ids given (ids that are not hot are ignored).
create or replace function public.reorder_hot_meals(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.meals m set hot_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where m.id = o.id and m.is_hot;
$$;
revoke execute on function public.reorder_hot_meals(uuid[]) from public, anon;
grant execute on function public.reorder_hot_meals(uuid[]) to authenticated;

-- save_meal again, now also saving the "hot" flag. When the payload has no is_hot the flag is left alone.
create or replace function public.save_meal(p_meal jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_meal ->> 'id', '')::uuid, gen_random_uuid());
  v_published boolean := coalesce((p_meal ->> 'published')::boolean, false);
  v_hot_given boolean := jsonb_typeof(p_meal -> 'is_hot') = 'boolean';
  v_hot boolean := coalesce((p_meal ->> 'is_hot')::boolean, false);
  v_draft text;
  it jsonb;
  pos integer := 0;
begin
  if jsonb_array_length(coalesce(p_meal -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'A meal needs at least one food.';
  end if;

  if v_hot and not v_published then
    raise exception 'A hot meal must be published.';
  end if;

  -- A newly hot meal goes to the end of the hot list; a meal that stays hot keeps its place.
  insert into public.meals (id, name, tag, accent, published, is_hot, hot_order)
  values (
    v_id, p_meal ->> 'name', coalesce(p_meal ->> 'tag', ''), p_meal ->> 'accent', v_published, v_hot,
    case when v_hot then coalesce((select max(m.hot_order) from public.meals m where m.is_hot), 0) + 1 else 0 end
  )
  on conflict (id) do update
    set name = excluded.name, tag = excluded.tag, accent = excluded.accent, published = excluded.published,
        is_hot = case when v_hot_given then excluded.is_hot else public.meals.is_hot end,
        hot_order = case
          when not (case when v_hot_given then excluded.is_hot else public.meals.is_hot end) then 0
          when public.meals.is_hot then public.meals.hot_order
          else excluded.hot_order
        end;

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


-- ================================================================
-- 0007_exercises
-- ================================================================
-- Exercises for the app's Workout tab: a managed list of muscle groups, a managed list of tags (workout days
-- such as "Chest day"), and the exercises themselves. Run after 0001-0006: SQL Editor > paste > Run.
--
-- Every exercise has exactly one muscle group ("Other" is the undeletable default and receives the exercises of a
-- deleted group) and any number of tags. Customers only ever see published exercises. The customer's own sets,
-- reps and weight live on the phone; nothing here stores them.

create table public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index muscle_groups_name_key on public.muscle_groups (lower(btrim(name)));
create unique index muscle_groups_one_default on public.muscle_groups (is_default) where is_default;
create trigger muscle_groups_updated_at before update on public.muscle_groups
  for each row execute function public.set_updated_at();

create or replace function public.protect_default_muscle_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default then raise exception 'The default muscle group cannot be deleted.'; end if;
    return old;
  end if;
  if old.is_default is distinct from new.is_default then
    raise exception 'The default muscle group cannot be changed.';
  end if;
  return new;
end;
$$;
create trigger muscle_groups_protect_default before update or delete on public.muscle_groups
  for each row execute function public.protect_default_muscle_group();

insert into public.muscle_groups (name, sort_order, is_default) values ('Other', 0, true);
insert into public.muscle_groups (name, sort_order) values
  ('Chest', 1), ('Back', 2), ('Shoulders', 3), ('Arms', 4), ('Legs', 5), ('Core', 6);

create table public.exercise_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exercise_tags_name_key on public.exercise_tags (lower(btrim(name)));
create trigger exercise_tags_updated_at before update on public.exercise_tags
  for each row execute function public.set_updated_at();

insert into public.exercise_tags (name, sort_order) values
  ('Chest day', 1), ('Back day', 2), ('Shoulder day', 3), ('Arm day', 4), ('Upper day', 5),
  ('Lower day', 6), ('Push', 7), ('Pull', 8), ('Legs', 9), ('Core', 10);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  muscle_group_id uuid not null references public.muscle_groups (id) on delete restrict,
  equipment text not null default '' check (char_length(equipment) <= 60),
  difficulty text not null default 'BEGINNER' check (difficulty in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  -- What the default amount counts: repetitions or seconds.
  measure text not null default 'REPS' check (measure in ('REPS', 'SECONDS')),
  default_sets integer not null default 3 check (default_sets between 1 and 20),
  -- Reps per set, or seconds per set, depending on "measure".
  default_target integer not null default 10 check (default_target between 1 and 999),
  -- Whether customers log a weight for each set.
  uses_weight boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exercises_name_key on public.exercises (lower(btrim(name)));
create index exercises_muscle_group_idx on public.exercises (muscle_group_id);
create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();

-- Deleting a tag just removes it from its exercises; the exercises are never deleted.
create table public.exercise_tag_links (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  tag_id uuid not null references public.exercise_tags (id) on delete cascade,
  primary key (exercise_id, tag_id)
);
create index exercise_tag_links_tag_idx on public.exercise_tag_links (tag_id);

alter table public.muscle_groups enable row level security;
alter table public.exercise_tags enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_tag_links enable row level security;

create policy "muscle groups read" on public.muscle_groups
  for select to anon, authenticated using (true);
create policy "muscle groups admin insert" on public.muscle_groups
  for insert to authenticated with check (public.is_admin());
create policy "muscle groups admin update" on public.muscle_groups
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "muscle groups admin delete" on public.muscle_groups
  for delete to authenticated using (public.is_admin());

create policy "exercise tags read" on public.exercise_tags
  for select to anon, authenticated using (true);
create policy "exercise tags admin insert" on public.exercise_tags
  for insert to authenticated with check (public.is_admin());
create policy "exercise tags admin update" on public.exercise_tags
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "exercise tags admin delete" on public.exercise_tags
  for delete to authenticated using (public.is_admin());

-- Anon and non-admins see published exercises only; admins see all.
create policy "exercises read" on public.exercises
  for select to anon, authenticated using (published or public.is_admin());
create policy "exercises admin insert" on public.exercises
  for insert to authenticated with check (public.is_admin());
create policy "exercises admin update" on public.exercises
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "exercises admin delete" on public.exercises
  for delete to authenticated using (public.is_admin());

-- A tag link is visible whenever its exercise is (the exercises policy applies inside this subquery).
create policy "exercise tag links read" on public.exercise_tag_links
  for select to anon, authenticated using (exists (select 1 from public.exercises e where e.id = exercise_id));
create policy "exercise tag links admin insert" on public.exercise_tag_links
  for insert to authenticated with check (public.is_admin());
create policy "exercise tag links admin delete" on public.exercise_tag_links
  for delete to authenticated using (public.is_admin());

grant select on public.muscle_groups, public.exercise_tags, public.exercises, public.exercise_tag_links to anon;
grant select, insert, update, delete on public.muscle_groups, public.exercise_tags, public.exercises to authenticated;
grant select, insert, delete on public.exercise_tag_links to authenticated;

-- Moves the group's exercises to the default group, then deletes it, in one transaction.
create or replace function public.delete_muscle_group(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_default uuid;
begin
  select id into v_default from public.muscle_groups where is_default;
  if p_id = v_default then
    raise exception 'The default muscle group cannot be deleted.';
  end if;
  update public.exercises set muscle_group_id = v_default where muscle_group_id = p_id;
  delete from public.muscle_groups where id = p_id;
end;
$$;

create or replace function public.reorder_muscle_groups(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.muscle_groups g set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where g.id = o.id;
$$;

create or replace function public.reorder_exercise_tags(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.exercise_tags t set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where t.id = o.id;
$$;

-- Creates or updates an exercise and replaces its tags with exactly "tag_ids", in one transaction.
create or replace function public.save_exercise(p_exercise jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_exercise ->> 'id', '')::uuid, gen_random_uuid());
  v_group uuid := coalesce(
    nullif(p_exercise ->> 'muscle_group_id', '')::uuid,
    (select id from public.muscle_groups where is_default)
  );
begin
  insert into public.exercises
    (id, name, muscle_group_id, equipment, difficulty, instructions, measure, default_sets, default_target,
     uses_weight, published)
  values (
    v_id, p_exercise ->> 'name', v_group, coalesce(p_exercise ->> 'equipment', ''),
    coalesce(p_exercise ->> 'difficulty', 'BEGINNER'), coalesce(p_exercise ->> 'instructions', ''),
    coalesce(p_exercise ->> 'measure', 'REPS'), (p_exercise ->> 'default_sets')::integer,
    (p_exercise ->> 'default_target')::integer, coalesce((p_exercise ->> 'uses_weight')::boolean, true),
    coalesce((p_exercise ->> 'published')::boolean, false)
  )
  on conflict (id) do update
    set name = excluded.name, muscle_group_id = excluded.muscle_group_id, equipment = excluded.equipment,
        difficulty = excluded.difficulty, instructions = excluded.instructions, measure = excluded.measure,
        default_sets = excluded.default_sets, default_target = excluded.default_target,
        uses_weight = excluded.uses_weight, published = excluded.published;

  delete from public.exercise_tag_links where exercise_id = v_id;
  insert into public.exercise_tag_links (exercise_id, tag_id)
  select distinct v_id, t::uuid
  from jsonb_array_elements_text(coalesce(p_exercise -> 'tag_ids', '[]'::jsonb)) as t;

  return v_id;
end;
$$;

revoke execute on function
  public.delete_muscle_group(uuid), public.reorder_muscle_groups(uuid[]),
  public.reorder_exercise_tags(uuid[]), public.save_exercise(jsonb)
  from public, anon;
grant execute on function
  public.delete_muscle_group(uuid), public.reorder_muscle_groups(uuid[]),
  public.reorder_exercise_tags(uuid[]), public.save_exercise(jsonb)
  to authenticated;
