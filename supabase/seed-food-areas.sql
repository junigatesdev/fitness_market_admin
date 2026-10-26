-- Tags the starter foods (from seed-foods.sql) with world areas. Run after 0005_world_areas.sql.
-- Only ADDS tags, never removes any. Foods or areas that don't exist (for example renamed) are skipped.
-- Safe to run again. The mapping is a starting guess: adjust any food in the portal.

do $areas$
declare
  v_map jsonb := $json${"Apple":["Global"],"Banana":["Global"],"Orange":["Global"],"Mango":["South Asian","Eastern"],"Grapes":["Global"],"Strawberries":["Global"],"Blueberries":["Global"],"Watermelon":["Global"],"Pineapple":["Global"],"Papaya":["Global"],"Pomegranate":["Middle Eastern","South Asian"],"Pear":["Global"],"Peach":["Global"],"Guava":["South Asian","Latin American","Eastern"],"Kiwi":["Global"],"Avocado":["Latin American"],"Dates":["Middle Eastern"],"Raisins":["Global"],"Potato":["Global"],"Sweet potato":["Global"],"Carrot":["Global"],"Broccoli":["Global"],"Spinach":["Global"],"Cucumber":["Global"],"Tomato":["Global"],"Onion":["Global"],"Cauliflower":["Global"],"Cabbage":["Global"],"Lettuce":["Global"],"Bell pepper":["Global"],"Eggplant":["Mediterranean","Middle Eastern","South Asian"],"Zucchini":["Global"],"Green beans":["Global"],"Green peas":["Global"],"Sweet corn":["Global"],"Mushrooms":["Global"],"Pumpkin":["Global"],"Okra":["South Asian","African","Eastern"],"Beetroot":["Global"],"Garlic":["Global"],"Chicken breast":["Global"],"Chicken thigh":["Global"],"Beef mince (lean)":["Global"],"Lamb mince":["Middle Eastern","South Asian"],"Bacon":["Western"],"Salmon":["Global"],"Tuna":["Global"],"Tilapia":["Global"],"Cod":["Global"],"Shrimp":["Global"],"Sardines":["Mediterranean"],"Egg":["Global"],"Egg white":["Global"],"Milk (whole)":["Global"],"Milk (semi-skimmed)":["Global"],"Milk (skimmed)":["Global"],"Yogurt (plain, whole milk)":["Global"],"Greek yogurt":["Mediterranean","Middle Eastern"],"Cheddar cheese":["Western"],"Mozzarella":["Mediterranean","Western"],"Paneer":["South Asian","Eastern"],"Cottage cheese":["Western"],"Ice cream":["Western"],"White rice":["Eastern","South Asian"],"Brown rice":["Global"],"Oats":["Western"],"Wheat flour (white)":["Global"],"Wheat flour (whole wheat)":["Global"],"Bread (white)":["Western"],"Bread (whole wheat)":["Western"],"Naan":["South Asian","Middle Eastern","Eastern"],"Roti (chapati)":["South Asian","Eastern"],"Pasta":["Mediterranean","Western"],"Egg noodles":["Eastern"],"Quinoa":["Latin American"],"Couscous":["African","Middle Eastern"],"Lentils":["South Asian","Middle Eastern","Eastern"],"Chickpeas":["South Asian","Middle Eastern","Mediterranean","Eastern"],"Kidney beans":["Latin American","South Asian"],"Black beans":["Latin American"],"Mung beans":["South Asian","Eastern"],"Tofu":["Eastern"],"Edamame":["Eastern"],"Hummus":["Middle Eastern","Mediterranean"],"Almonds":["Global"],"Walnuts":["Global"],"Peanuts":["Global"],"Cashews":["Global"],"Pistachios":["Middle Eastern"],"Chia seeds":["Global"],"Flax seeds":["Global"],"Sunflower seeds":["Global"],"Peanut butter":["Western"],"Olive oil":["Mediterranean"],"Vegetable oil":["Global"],"Coconut oil":["Global"],"Butter":["Western"],"Ghee":["South Asian","Eastern"],"Mayonnaise":["Western"],"Water":["Global"],"Black tea":["Global"],"Green tea":["Eastern"],"Coffee":["Global"],"Orange juice":["Global"],"Apple juice":["Global"],"Cola":["Western"],"Coconut water":["Global"],"Dark chocolate":["Western"],"Milk chocolate":["Western"],"Sugar":["Global"],"Honey":["Global"],"Potato chips":["Western"],"Popcorn":["Western"],"Jam":["Western"],"Pizza":["Western","Mediterranean"]}$json$;
  r record;
  v_rows integer;
  v_added integer := 0;
begin
  for r in
    select f.id as food_id, a.id as area_id
    from jsonb_each(v_map) m
    cross join lateral jsonb_array_elements_text(m.value) as tag(name)
    join public.foods f on lower(btrim(f.name)) = lower(m.key)
    join public.world_areas a on lower(btrim(a.name)) = lower(tag.name)
  loop
    insert into public.food_world_areas (food_id, area_id) values (r.food_id, r.area_id) on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;
  raise notice 'Added % food area tags.', v_added;
end
$areas$;
