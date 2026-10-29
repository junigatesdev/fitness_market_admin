-- Fitness Market: 24 starter exercises, published, with a muscle group, equipment, defaults and workout-day tags.
-- Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: setup-all.sql (or migrations 0001-0007) to have been run first.
--
-- Safe to run again: an exercise whose name already exists is skipped, and nothing you made is changed.
-- Set v_publish to false to add them as drafts instead.

do $seed$
declare
  v_publish boolean := true;
  -- [name, muscle group, equipment, difficulty, measure, sets, reps or seconds, uses weight, tags, how to]
  v_data jsonb := $json$[
    ["Barbell bench press","Chest","Barbell","INTERMEDIATE","REPS",4,6,true,["Chest day","Upper day","Push"],"Lie flat, lower the bar to your mid chest with control, then press it back up. Keep your feet planted and shoulder blades pulled back."],
    ["Incline dumbbell press","Chest","Dumbbell","INTERMEDIATE","REPS",3,8,true,["Chest day","Upper day","Push"],"Set the bench to about 30 degrees. Press the dumbbells up and slightly together, then lower slowly until your elbows are just below the bench."],
    ["Push-up","Chest","Bodyweight","BEGINNER","REPS",3,12,false,["Chest day","Upper day","Push"],"Hands under your shoulders, body in a straight line. Lower your chest to the floor and press back up."],
    ["Cable fly","Chest","Cable","INTERMEDIATE","REPS",3,12,true,["Chest day","Upper day","Push"],"With a slight bend in your elbows, bring the handles together in front of your chest in a wide arc."],
    ["Lat pulldown","Back","Machine","BEGINNER","REPS",3,10,true,["Back day","Upper day","Pull"],"Pull the bar to your upper chest, leading with your elbows. Control it on the way up."],
    ["Pull-up","Back","Bodyweight","ADVANCED","REPS",3,6,false,["Back day","Upper day","Pull"],"Hang with an overhand grip, pull until your chin passes the bar, then lower fully."],
    ["Seated cable row","Back","Cable","BEGINNER","REPS",3,10,true,["Back day","Upper day","Pull"],"Sit tall, pull the handle to your belly and squeeze your shoulder blades together."],
    ["Bent-over barbell row","Back","Barbell","INTERMEDIATE","REPS",4,8,true,["Back day","Upper day","Pull"],"Hinge at the hips with a flat back and row the bar to your lower ribs."],
    ["Overhead shoulder press","Shoulders","Dumbbell","INTERMEDIATE","REPS",3,10,true,["Shoulder day","Upper day","Push"],"Press the dumbbells from shoulder height to overhead without arching your back."],
    ["Lateral raise","Shoulders","Dumbbell","BEGINNER","REPS",3,12,true,["Shoulder day","Upper day","Push"],"Raise the dumbbells out to the sides to shoulder height with a slight bend in your elbows."],
    ["Face pull","Shoulders","Cable","BEGINNER","REPS",3,15,true,["Shoulder day","Upper day","Pull"],"Pull the rope toward your face, elbows high, and rotate your hands outward."],
    ["Barbell biceps curl","Arms","Barbell","BEGINNER","REPS",3,10,true,["Arm day","Upper day","Pull"],"Curl the bar to your shoulders without swinging, then lower slowly."],
    ["Hammer curl","Arms","Dumbbell","BEGINNER","REPS",3,10,true,["Arm day","Upper day","Pull"],"Hold the dumbbells with palms facing each other and curl them up."],
    ["Triceps pushdown","Arms","Cable","BEGINNER","REPS",3,12,true,["Arm day","Upper day","Push"],"Keep your elbows by your sides and press the handle down until your arms are straight."],
    ["Skull crusher","Arms","Barbell","INTERMEDIATE","REPS",3,10,true,["Arm day","Upper day","Push"],"Lower the bar toward your forehead by bending only your elbows, then extend."],
    ["Back squat","Legs","Barbell","INTERMEDIATE","REPS",4,6,true,["Lower day","Legs"],"Bar on your upper back, sit down between your hips until your thighs are parallel, then stand."],
    ["Goblet squat","Legs","Kettlebell","BEGINNER","REPS",3,12,true,["Lower day","Legs"],"Hold the weight at your chest, squat deep with your chest up, then stand."],
    ["Romanian deadlift","Legs","Barbell","INTERMEDIATE","REPS",3,8,true,["Lower day","Legs","Pull"],"Push your hips back with soft knees until you feel a stretch in your hamstrings, then stand."],
    ["Walking lunge","Legs","Dumbbell","BEGINNER","REPS",3,12,true,["Lower day","Legs"],"Step forward into a lunge, push through the front foot to bring the back foot through."],
    ["Leg press","Legs","Machine","BEGINNER","REPS",3,12,true,["Lower day","Legs"],"Lower the sled until your knees reach about 90 degrees, then press without locking out."],
    ["Standing calf raise","Legs","Machine","BEGINNER","REPS",3,15,true,["Lower day","Legs"],"Rise onto your toes as high as you can, pause, then lower slowly."],
    ["Plank","Core","Bodyweight","BEGINNER","SECONDS",3,45,false,["Core"],"Forearms down, body in a straight line. Hold without letting your hips sag."],
    ["Hanging knee raise","Core","Bodyweight","INTERMEDIATE","REPS",3,12,false,["Core"],"Hang from a bar and bring your knees up toward your chest without swinging."],
    ["Russian twist","Core","Bodyweight","BEGINNER","REPS",3,20,true,["Core"],"Lean back slightly with your feet raised and rotate your torso from side to side."]
  ]$json$;

  e jsonb;
  v_group uuid;
  v_id uuid;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  for e in select * from jsonb_array_elements(v_data) loop
    if exists (select 1 from public.exercises where lower(btrim(name)) = lower(e ->> 0)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select id into v_group from public.muscle_groups where lower(btrim(name)) = lower(e ->> 1);
    if v_group is null then
      select id into v_group from public.muscle_groups where is_default;
    end if;

    insert into public.exercises
      (name, muscle_group_id, equipment, difficulty, measure, default_sets, default_target, uses_weight,
       instructions, published)
    values (
      e ->> 0, v_group, e ->> 2, e ->> 3, e ->> 4, (e ->> 5)::integer, (e ->> 6)::integer, (e ->> 7)::boolean,
      e ->> 9, v_publish
    )
    returning id into v_id;

    -- Tags that no longer exist in your list are simply left out.
    insert into public.exercise_tag_links (exercise_id, tag_id)
    select v_id, t.id
    from jsonb_array_elements_text(e -> 8) as n
    join public.exercise_tags t on lower(btrim(t.name)) = lower(n)
    on conflict do nothing;

    v_added := v_added + 1;
  end loop;
  raise notice 'Exercises added: %, already there: %', v_added, v_skipped;
end;
$seed$;
