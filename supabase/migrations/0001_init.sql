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
