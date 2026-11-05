-- Drinks (tea, milk tea, coffee ...) for the app's "Add food > Drinks" row. The customer picks a drink, then the cup
-- size, the milk and the sugar; the app works out the calories from the milk and sugar foods chosen here and logs one
-- entry. Nothing is stored per customer here.
-- Run after 0001-0008: SQL Editor > paste > Run.
--
-- Milk options are food preparations measured in MILLILITER; the sugar is a preparation measured in GRAM. The app
-- skips a drink's milk or sugar when its food is not published (it cannot read drafts).

create table public.drinks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  published boolean not null default false,
  -- The usual cup, and the calories of the tea or coffee itself per 100 ml (before milk and sugar).
  cup_ml integer not null default 250 check (cup_ml between 10 and 2000),
  base_kcal_per_100ml numeric not null default 0 check (base_kcal_per_100ml >= 0),
  asks_milk boolean not null default true,
  milk_default_ml integer not null default 100 check (milk_default_ml between 0 and 2000),
  -- Quick-pick buttons for the milk amount, in ml.
  milk_quick_ml integer[] not null default '{50,100,150}',
  asks_sugar boolean not null default true,
  sugar_variant_id uuid references public.food_variants (id) on delete set null,
  sugar_default_tsp numeric not null default 2 check (sugar_default_tsp >= 0 and sugar_default_tsp <= 50),
  -- How much one teaspoon of sugar weighs, in grams.
  tsp_grams numeric not null default 4 check (tsp_grams > 0 and tsp_grams <= 50),
  -- "Anything else?": a name and calories the customer types.
  asks_other boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index drinks_name_key on public.drinks (lower(btrim(name)));
create trigger drinks_updated_at before update on public.drinks
  for each row execute function public.set_updated_at();

-- The milk choices of a drink (Full cream, Skimmed ...), in the order shown.
create table public.drink_milks (
  drink_id uuid not null references public.drinks (id) on delete cascade,
  food_variant_id uuid not null references public.food_variants (id) on delete cascade,
  position integer not null default 0,
  primary key (drink_id, food_variant_id)
);
create index drink_milks_variant_idx on public.drink_milks (food_variant_id);

alter table public.drinks enable row level security;
alter table public.drink_milks enable row level security;

create policy "drinks read" on public.drinks
  for select to anon, authenticated using (published or public.is_admin());
create policy "drinks admin insert" on public.drinks
  for insert to authenticated with check (public.is_admin());
create policy "drinks admin update" on public.drinks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "drinks admin delete" on public.drinks
  for delete to authenticated using (public.is_admin());

create policy "drink milks read" on public.drink_milks
  for select to anon, authenticated using (exists (select 1 from public.drinks d where d.id = drink_id));
create policy "drink milks admin insert" on public.drink_milks
  for insert to authenticated with check (public.is_admin());
create policy "drink milks admin update" on public.drink_milks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "drink milks admin delete" on public.drink_milks
  for delete to authenticated using (public.is_admin());

grant select on public.drinks, public.drink_milks to anon;
grant select, insert, update, delete on public.drinks, public.drink_milks to authenticated;

-- Creates or updates a drink and replaces its milk choices, in one transaction.
create or replace function public.save_drink(p_drink jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_drink ->> 'id', '')::uuid, gen_random_uuid());
  v_milk uuid;
  v_pos integer := 0;
begin
  insert into public.drinks (
    id, name, sort_order, published, cup_ml, base_kcal_per_100ml,
    asks_milk, milk_default_ml, milk_quick_ml,
    asks_sugar, sugar_variant_id, sugar_default_tsp, tsp_grams, asks_other
  ) values (
    v_id, p_drink ->> 'name',
    coalesce((p_drink ->> 'sort_order')::integer, (select coalesce(max(sort_order), 0) + 1 from public.drinks)),
    coalesce((p_drink ->> 'published')::boolean, false),
    coalesce((p_drink ->> 'cup_ml')::integer, 250),
    coalesce((p_drink ->> 'base_kcal_per_100ml')::numeric, 0),
    coalesce((p_drink ->> 'asks_milk')::boolean, true),
    coalesce((p_drink ->> 'milk_default_ml')::integer, 100),
    case when p_drink ? 'milk_quick_ml' then array(select (jsonb_array_elements_text(p_drink -> 'milk_quick_ml'))::integer) else '{50,100,150}'::integer[] end,
    coalesce((p_drink ->> 'asks_sugar')::boolean, true),
    nullif(p_drink ->> 'sugar_variant_id', '')::uuid,
    coalesce((p_drink ->> 'sugar_default_tsp')::numeric, 2),
    coalesce((p_drink ->> 'tsp_grams')::numeric, 4),
    coalesce((p_drink ->> 'asks_other')::boolean, true)
  )
  on conflict (id) do update
    set name = excluded.name, published = excluded.published, cup_ml = excluded.cup_ml,
        base_kcal_per_100ml = excluded.base_kcal_per_100ml, asks_milk = excluded.asks_milk,
        milk_default_ml = excluded.milk_default_ml, milk_quick_ml = excluded.milk_quick_ml,
        asks_sugar = excluded.asks_sugar, sugar_variant_id = excluded.sugar_variant_id,
        sugar_default_tsp = excluded.sugar_default_tsp, tsp_grams = excluded.tsp_grams,
        asks_other = excluded.asks_other,
        sort_order = coalesce((p_drink ->> 'sort_order')::integer, public.drinks.sort_order);

  delete from public.drink_milks where drink_id = v_id;
  for v_milk in select (jsonb_array_elements_text(coalesce(p_drink -> 'milk_variant_ids', '[]'::jsonb)))::uuid loop
    insert into public.drink_milks (drink_id, food_variant_id, position) values (v_id, v_milk, v_pos)
    on conflict do nothing;
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.reorder_drinks(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.drinks d set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where d.id = o.id;
$$;

revoke execute on function public.save_drink(jsonb), public.reorder_drinks(uuid[]) from public, anon;
grant execute on function public.save_drink(jsonb), public.reorder_drinks(uuid[]) to authenticated;
