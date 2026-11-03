-- Fitness Market: 4 starter default workout days (Upper body, Lower body, Push, Pull), built from the starter
-- exercises (seed-exercises.sql). Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: setup-all.sql (or migrations 0001-0008) and seed-exercises.sql to have been run first.
--
-- Safe to run again: a day whose name already exists is skipped, and nothing you made is changed. An exercise that
-- cannot be found by name is left out of its day (with a message). Set v_publish to false to add them as drafts.

do $seed$
declare
  v_publish boolean := true;
  -- [day, [[area, [exercise names]], ...]]. The areas are the portal's muscle groups.
  v_data jsonb := $json$[
    ["Upper body", [["Chest", ["Barbell bench press", "Incline dumbbell press", "Push-up"]],
                    ["Shoulders", ["Overhead shoulder press", "Lateral raise", "Face pull"]],
                    ["Back", ["Lat pulldown", "Seated cable row", "Bent-over barbell row", "Pull-up"]]]],
    ["Lower body", [["Legs", ["Back squat", "Goblet squat", "Romanian deadlift", "Walking lunge", "Leg press", "Standing calf raise"]],
                    ["Core", ["Plank", "Hanging knee raise", "Russian twist"]]]],
    ["Push", [["Chest", ["Barbell bench press", "Incline dumbbell press", "Push-up", "Cable fly"]],
              ["Shoulders", ["Overhead shoulder press", "Lateral raise"]],
              ["Arms", ["Triceps pushdown", "Skull crusher"]]]],
    ["Pull", [["Back", ["Lat pulldown", "Seated cable row", "Bent-over barbell row", "Pull-up"]],
              ["Arms", ["Barbell biceps curl", "Hammer curl"]],
              ["Shoulders", ["Face pull"]]]]
  ]$json$;

  d jsonb;
  a jsonb;
  x jsonb;
  v_nodes jsonb;
  v_children jsonb;
  v_ex uuid;
  v_order integer := 0;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  select coalesce(max(sort_order), 0) into v_order from public.default_days;
  for d in select * from jsonb_array_elements(v_data) loop
    if exists (select 1 from public.default_days where lower(btrim(name)) = lower(d ->> 0)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_nodes := '[]'::jsonb;
    for a in select * from jsonb_array_elements(d -> 1) loop
      v_children := '[]'::jsonb;
      for x in select * from jsonb_array_elements(a -> 1) loop
        select id into v_ex from public.exercises where lower(btrim(name)) = lower(x #>> '{}');
        if v_ex is null then
          raise notice 'Exercise not found, left out of %: %', d ->> 0, x #>> '{}';
        else
          v_children := v_children || jsonb_build_array(jsonb_build_object('exercise_id', v_ex));
        end if;
      end loop;
      if jsonb_array_length(v_children) > 0 then
        v_nodes := v_nodes || jsonb_build_array(jsonb_build_object('name', a ->> 0, 'children', v_children));
      end if;
    end loop;

    if jsonb_array_length(v_nodes) = 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_order := v_order + 1;
    perform public.save_default_day(jsonb_build_object(
      'name', d ->> 0, 'published', v_publish, 'sort_order', v_order, 'nodes', v_nodes));
    v_added := v_added + 1;
  end loop;
  raise notice 'Default days added: %, skipped: %', v_added, v_skipped;
end;
$seed$;
