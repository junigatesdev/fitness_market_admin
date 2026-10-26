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
