-- Meal categories: group meals in the app's Meals screen (High protein, Western, Eastern, Indian, ...).
-- A managed list (like world areas) and a meal can be in several categories, like tags.
-- Run after 0001-0010: SQL Editor > New query > paste > Run.

create table public.meal_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index meal_categories_name_key on public.meal_categories (lower(btrim(name)));
create trigger meal_categories_updated_at before update on public.meal_categories
  for each row execute function public.set_updated_at();

-- Starting list. Rename, reorder, add or delete in the portal.
insert into public.meal_categories (name, sort_order) values
  ('High protein', 1), ('Western', 2), ('Eastern', 3), ('Indian', 4);

-- Deleting a category just removes the tag from its meals; the meals themselves are never deleted.
create table public.meal_category_links (
  meal_id uuid not null references public.meals (id) on delete cascade,
  category_id uuid not null references public.meal_categories (id) on delete cascade,
  primary key (meal_id, category_id)
);
create index meal_category_links_category_idx on public.meal_category_links (category_id);

alter table public.meal_categories enable row level security;
alter table public.meal_category_links enable row level security;

create policy "meal categories read" on public.meal_categories
  for select to anon, authenticated using (true);
create policy "meal categories admin insert" on public.meal_categories
  for insert to authenticated with check (public.is_admin());
create policy "meal categories admin update" on public.meal_categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "meal categories admin delete" on public.meal_categories
  for delete to authenticated using (public.is_admin());

-- A link is visible whenever its meal is (the meals policy applies inside this subquery).
create policy "meal category links read" on public.meal_category_links
  for select to anon, authenticated using (exists (select 1 from public.meals m where m.id = meal_id));
create policy "meal category links admin insert" on public.meal_category_links
  for insert to authenticated with check (public.is_admin());
create policy "meal category links admin delete" on public.meal_category_links
  for delete to authenticated using (public.is_admin());

grant select on public.meal_categories, public.meal_category_links to anon;
grant select, insert, update, delete on public.meal_categories to authenticated;
grant select, insert, delete on public.meal_category_links to authenticated;

-- Sets the display order to the order of the ids given.
create or replace function public.reorder_meal_categories(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.meal_categories c set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where c.id = o.id;
$$;
revoke execute on function public.reorder_meal_categories(uuid[]) from public, anon;
grant execute on function public.reorder_meal_categories(uuid[]) to authenticated;

-- save_meal again, now also saving the meal's categories (see the note inside).
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
  v_cats uuid[];
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

  -- When the payload has a "category_ids" array the meal's categories are replaced by exactly that list; when it is
  -- absent they are left alone.
  if jsonb_typeof(p_meal -> 'category_ids') = 'array' then
    v_cats := array(select (c)::uuid from jsonb_array_elements_text(p_meal -> 'category_ids') c);
    delete from public.meal_category_links where meal_id = v_id and category_id <> all (v_cats);
    insert into public.meal_category_links (meal_id, category_id)
    select v_id, c from unnest(v_cats) c
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_meal(jsonb) from public, anon;
grant execute on function public.save_meal(jsonb) to authenticated;
