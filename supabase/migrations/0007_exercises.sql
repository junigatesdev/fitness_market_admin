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
