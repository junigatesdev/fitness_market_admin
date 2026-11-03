-- Default workout days for new customers. A default day is a tree: areas (usually muscle groups), groups inside
-- them, and exercises at the bottom. Published days are copied onto a customer's phone the first time the app
-- opens; after that they are the customer's own, so nothing here ever changes an existing customer's days.
-- Run after 0001-0007: SQL Editor > paste > Run.
--
-- A node is either a GROUP (has a name and may contain nodes) or an EXERCISE (points at an exercise, no children).
-- Deleting an exercise removes it from the default days that use it. Unpublishing it leaves it in the day; the app
-- skips exercises it cannot see when it copies the day.

create table public.default_days (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index default_days_name_key on public.default_days (lower(btrim(name)));
create trigger default_days_updated_at before update on public.default_days
  for each row execute function public.set_updated_at();

create table public.default_day_nodes (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.default_days (id) on delete cascade,
  parent_id uuid references public.default_day_nodes (id) on delete cascade,
  position integer not null default 0,
  name text check (name is null or char_length(btrim(name)) between 1 and 60),
  exercise_id uuid references public.exercises (id) on delete cascade,
  -- Exactly one of "name" (a group) or "exercise_id" (an exercise).
  constraint default_day_nodes_kind check ((name is null) <> (exercise_id is null))
);
create index default_day_nodes_day_idx on public.default_day_nodes (day_id);
create index default_day_nodes_parent_idx on public.default_day_nodes (parent_id);
create index default_day_nodes_exercise_idx on public.default_day_nodes (exercise_id);

alter table public.default_days enable row level security;
alter table public.default_day_nodes enable row level security;

-- Anon and non-admins see published days only; admins see all.
create policy "default days read" on public.default_days
  for select to anon, authenticated using (published or public.is_admin());
create policy "default days admin insert" on public.default_days
  for insert to authenticated with check (public.is_admin());
create policy "default days admin update" on public.default_days
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "default days admin delete" on public.default_days
  for delete to authenticated using (public.is_admin());

-- A node is visible whenever its day is (the days policy applies inside this subquery).
create policy "default day nodes read" on public.default_day_nodes
  for select to anon, authenticated using (exists (select 1 from public.default_days d where d.id = day_id));
create policy "default day nodes admin insert" on public.default_day_nodes
  for insert to authenticated with check (public.is_admin());
create policy "default day nodes admin update" on public.default_day_nodes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "default day nodes admin delete" on public.default_day_nodes
  for delete to authenticated using (public.is_admin());

grant select on public.default_days, public.default_day_nodes to anon;
grant select, insert, update, delete on public.default_days, public.default_day_nodes to authenticated;

-- Inserts the nodes of one level (and, recursively, their children). Each node is either
-- {"name": "Chest", "children": [...]} or {"exercise_id": "..."}.
create or replace function public.insert_default_day_nodes(p_day uuid, p_parent uuid, p_nodes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n jsonb;
  i integer := 0;
  v_id uuid;
begin
  for n in select * from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) loop
    v_id := gen_random_uuid();
    if nullif(n ->> 'exercise_id', '') is not null then
      insert into public.default_day_nodes (id, day_id, parent_id, position, exercise_id)
      values (v_id, p_day, p_parent, i, (n ->> 'exercise_id')::uuid);
    else
      insert into public.default_day_nodes (id, day_id, parent_id, position, name)
      values (v_id, p_day, p_parent, i, n ->> 'name');
      perform public.insert_default_day_nodes(p_day, v_id, n -> 'children');
    end if;
    i := i + 1;
  end loop;
end;
$$;

-- Creates or updates a default day and replaces its whole tree, in one transaction.
create or replace function public.save_default_day(p_day jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_day ->> 'id', '')::uuid, gen_random_uuid());
begin
  insert into public.default_days (id, name, sort_order, published)
  values (
    v_id, p_day ->> 'name',
    coalesce((p_day ->> 'sort_order')::integer, (select coalesce(max(sort_order), 0) + 1 from public.default_days)),
    coalesce((p_day ->> 'published')::boolean, false)
  )
  on conflict (id) do update
    set name = excluded.name, published = excluded.published,
        sort_order = coalesce((p_day ->> 'sort_order')::integer, public.default_days.sort_order);

  delete from public.default_day_nodes where day_id = v_id;
  perform public.insert_default_day_nodes(v_id, null, p_day -> 'nodes');
  return v_id;
end;
$$;

create or replace function public.reorder_default_days(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.default_days d set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where d.id = o.id;
$$;

revoke execute on function
  public.insert_default_day_nodes(uuid, uuid, jsonb), public.save_default_day(jsonb), public.reorder_default_days(uuid[])
  from public, anon;
grant execute on function
  public.insert_default_day_nodes(uuid, uuid, jsonb), public.save_default_day(jsonb), public.reorder_default_days(uuid[])
  to authenticated;
