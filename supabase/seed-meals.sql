-- Fitness Market: 6 starter meals built from the starter foods (seed-foods.sql).
-- Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: setup-all.sql (or migrations 0001-0006) and seed-foods.sql to have been run first.
--
-- A meal's calories and protein are not stored: the app and portal compute them from the foods.
-- Safe to run again: a meal whose name already exists is skipped, and nothing you made is changed.
-- A meal whose foods can't all be found is skipped (with a message) rather than saved half-built.

do $seed$
declare
  -- true  = visible in the app. A meal can only be published if ALL its foods are published.
  v_publish boolean := true;
  -- true  = also shown on the app's Home screen ("hot"), in the order listed below. Needs v_publish.
  v_hot boolean := true;

  v_data jsonb := $json$[{"n":"Grilled Chicken & Rice Bowl","tag":"High protein","accent":"GREEN","items":[["Chicken breast","Grilled",150],["White rice","Boiled",150],["Cucumber","Raw",80]]},{"n":"Oats & Banana Breakfast","tag":"Quick breakfast","accent":"OCEAN","items":[["Oats","Cooked with water",250],["Banana","Raw",100],["Almonds","Raw",15]]},{"n":"Veggie Egg Scramble","tag":"Breakfast","accent":"BLUE","items":[["Egg","Scrambled",120],["Spinach","Raw",50],["Bread (whole wheat)","Plain (1 slice)",2]]},{"n":"Lentil & Roti Lunch","tag":"Plant based","accent":"GREEN","items":[["Lentils","Boiled",200],["Carrot","Boiled",80],["Roti (chapati)","Whole wheat, no oil",60]]},{"n":"Salmon & Sweet Potato","tag":"Omega-3","accent":"OCEAN","items":[["Salmon","Baked",130],["Sweet potato","Baked",200],["Broccoli","Steamed",100]]},{"n":"Greek Yogurt Parfait","tag":"Snack","accent":"NEUTRAL","items":[["Greek yogurt","Plain, non-fat",200],["Blueberries","Raw",80],["Honey","Plain",10]]}]$json$;

  m jsonb;
  it jsonb;
  v_meal uuid;
  v_variant uuid;
  v_pub boolean;
  v_all_pub boolean;
  v_ids uuid[];
  v_found boolean;
  v_pos integer;
  v_is_pub boolean;
  v_is_hot boolean;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  for m in select * from jsonb_array_elements(v_data) loop
    if exists (select 1 from public.meals where lower(btrim(name)) = lower(m ->> 'n')) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Find every food preparation first, so a meal is never saved half-built.
    v_ids := '{}';
    v_all_pub := true;
    v_found := true;
    for it in select * from jsonb_array_elements(m -> 'items') loop
      v_variant := null;
      select fv.id, f.published into v_variant, v_pub
      from public.food_variants fv
      join public.foods f on f.id = fv.food_id
      where lower(btrim(f.name)) = lower(it ->> 0) and lower(btrim(fv.name)) = lower(it ->> 1)
      order by f.created_at
      limit 1;
      if v_variant is null then
        raise notice 'Skipped "%": could not find % (%). Run seed-foods.sql first.', m ->> 'n', it ->> 0, it ->> 1;
        v_found := false;
        exit;
      end if;
      v_ids := v_ids || v_variant;
      v_all_pub := v_all_pub and v_pub;
    end loop;
    if not v_found then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_is_pub := v_publish and v_all_pub;
    if v_publish and not v_all_pub then
      raise notice '"%" saved as a draft: some of its foods are not published yet.', m ->> 'n';
    end if;
    v_is_hot := v_hot and v_is_pub;

    insert into public.meals (name, tag, accent, published, is_hot, hot_order)
    values (
      m ->> 'n', m ->> 'tag', m ->> 'accent', v_is_pub, v_is_hot,
      case when v_is_hot then coalesce((select max(hot_order) from public.meals where is_hot), 0) + 1 else 0 end
    )
    returning id into v_meal;

    v_pos := 0;
    for it in select * from jsonb_array_elements(m -> 'items') loop
      v_pos := v_pos + 1;
      insert into public.meal_items (meal_id, food_variant_id, amount, position)
      values (v_meal, v_ids[v_pos], (it ->> 2)::numeric, v_pos);
    end loop;
    v_added := v_added + 1;
  end loop;

  raise notice 'Added % meals (% skipped).', v_added, v_skipped;
end
$seed$;
