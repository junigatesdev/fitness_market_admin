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
