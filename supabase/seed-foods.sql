-- Fitness Market: starter food list (115 general foods, 162 preparations).
-- Run in Supabase: SQL Editor > New query > paste all > Run. Needs setup-all.sql to have been run first.
--
-- NUMBERS ARE APPROXIMATE. They are typical reference values (USDA-style, per 100 g or 100 ml unless the
-- preparation says "1 medium", "1 slice" and so on). Real products and recipes differ. Review before relying on them.
--
-- Safe to run again: foods that already exist (same name, ignoring case) are not duplicated, and a
-- preparation that already exists on a food is left untouched. Your own foods are never changed.

do $seed$
declare
  -- true  = visible in the app right away.
  -- false = saved as drafts: review them in the portal, then publish.
  v_publish boolean := true;

  v_data jsonb := $json$[{"n":"Apple","c":"Fruit","v":[["Raw",52,0.3,13.8,0.2],["Raw (1 medium)",95,0.5,25.1,0.3,1,"PIECE"]]},{"n":"Banana","c":"Fruit","v":[["Raw",89,1.1,22.8,0.3],["Raw (1 medium)",105,1.3,27,0.4,1,"PIECE"]]},{"n":"Orange","c":"Fruit","v":[["Raw",47,0.9,11.8,0.1]]},{"n":"Mango","c":"Fruit","v":[["Raw",60,0.8,15,0.4]]},{"n":"Grapes","c":"Fruit","v":[["Raw",69,0.7,18.1,0.2]]},{"n":"Strawberries","c":"Fruit","v":[["Raw",32,0.7,7.7,0.3]]},{"n":"Blueberries","c":"Fruit","v":[["Raw",57,0.7,14.5,0.3]]},{"n":"Watermelon","c":"Fruit","v":[["Raw",30,0.6,7.6,0.2]]},{"n":"Pineapple","c":"Fruit","v":[["Raw",50,0.5,13.1,0.1]]},{"n":"Papaya","c":"Fruit","v":[["Raw",43,0.5,10.8,0.3]]},{"n":"Pomegranate","c":"Fruit","v":[["Raw (seeds)",83,1.7,18.7,1.2]]},{"n":"Pear","c":"Fruit","v":[["Raw",57,0.4,15.2,0.1]]},{"n":"Peach","c":"Fruit","v":[["Raw",39,0.9,9.5,0.3]]},{"n":"Guava","c":"Fruit","v":[["Raw",68,2.6,14.3,1]]},{"n":"Kiwi","c":"Fruit","v":[["Raw",61,1.1,14.7,0.5]]},{"n":"Avocado","c":"Fruit","v":[["Raw",160,2,8.5,14.7]]},{"n":"Dates","c":"Fruit","v":[["Dried (Medjool)",277,1.8,75,0.2]]},{"n":"Raisins","c":"Fruit","v":[["Dried",299,3.1,79.2,0.5]]},{"n":"Potato","c":"Vegetable","v":[["Raw",77,2,17.5,0.1],["Boiled",87,1.9,20.1,0.1],["Baked",93,2.5,21.2,0.1],["Deep fried (french fries)",312,3.4,41.4,14.8]]},{"n":"Sweet potato","c":"Vegetable","v":[["Raw",86,1.6,20.1,0.1],["Boiled",76,1.4,17.7,0.1],["Baked",90,2,20.7,0.2]]},{"n":"Carrot","c":"Vegetable","v":[["Raw",41,0.9,9.6,0.2],["Boiled",35,0.8,8.2,0.2]]},{"n":"Broccoli","c":"Vegetable","v":[["Raw",34,2.8,6.6,0.4],["Steamed",35,2.4,7.2,0.4]]},{"n":"Spinach","c":"Vegetable","v":[["Raw",23,2.9,3.6,0.4],["Boiled",23,3,3.8,0.3]]},{"n":"Cucumber","c":"Vegetable","v":[["Raw",15,0.7,3.6,0.1]]},{"n":"Tomato","c":"Vegetable","v":[["Raw",18,0.9,3.9,0.2]]},{"n":"Onion","c":"Vegetable","v":[["Raw",40,1.1,9.3,0.1]]},{"n":"Cauliflower","c":"Vegetable","v":[["Raw",25,1.9,5,0.3],["Boiled",23,1.8,4.1,0.5]]},{"n":"Cabbage","c":"Vegetable","v":[["Raw",25,1.3,5.8,0.1]]},{"n":"Lettuce","c":"Vegetable","v":[["Raw",17,1.2,3.3,0.3]]},{"n":"Bell pepper","c":"Vegetable","v":[["Raw",31,1,6,0.3]]},{"n":"Eggplant","c":"Vegetable","v":[["Raw",25,1,5.9,0.2],["Boiled",35,0.8,8.7,0.2]]},{"n":"Zucchini","c":"Vegetable","v":[["Raw",17,1.2,3.1,0.3]]},{"n":"Green beans","c":"Vegetable","v":[["Raw",31,1.8,7,0.2],["Boiled",35,1.9,7.9,0.3]]},{"n":"Green peas","c":"Vegetable","v":[["Raw",81,5.4,14.5,0.4],["Boiled",84,5.4,15.6,0.2]]},{"n":"Sweet corn","c":"Vegetable","v":[["Raw",86,3.3,19,1.4],["Boiled",96,3.4,21,1.5]]},{"n":"Mushrooms","c":"Vegetable","v":[["Raw",22,3.1,3.3,0.3],["Boiled",28,2.2,5.3,0.5]]},{"n":"Pumpkin","c":"Vegetable","v":[["Raw",26,1,6.5,0.1]]},{"n":"Okra","c":"Vegetable","v":[["Raw",33,1.9,7.5,0.2],["Boiled",22,1.9,4.5,0.2]]},{"n":"Beetroot","c":"Vegetable","v":[["Raw",43,1.6,9.6,0.2],["Boiled",44,1.7,10,0.2]]},{"n":"Garlic","c":"Vegetable","v":[["Raw",149,6.4,33.1,0.5]]},{"n":"Chicken breast","c":"Meat & poultry","v":[["Raw",120,22.5,0,2.6],["Boiled",151,29,0,3.2],["Grilled",165,31,0,3.6],["Air fried",170,31.5,0,4.2],["Pan fried",187,30.6,0,6.9]]},{"n":"Chicken thigh","c":"Meat & poultry","v":[["Raw",121,19.7,0,4.1],["Roasted",179,24.8,0,8.2]]},{"n":"Beef mince (lean)","c":"Meat & poultry","v":[["Raw",176,20,0,10],["Pan fried",217,26.1,0,11.8]]},{"n":"Lamb mince","c":"Meat & poultry","v":[["Raw",282,16.6,0,23.4],["Grilled",283,25.6,0,20]]},{"n":"Bacon","c":"Meat & poultry","v":[["Pan fried",541,37,1.4,42]]},{"n":"Salmon","c":"Fish & seafood","v":[["Raw",208,20.4,0,13.4],["Baked",206,22.1,0,12.4]]},{"n":"Tuna","c":"Fish & seafood","v":[["Canned in water",116,25.5,0,0.8]]},{"n":"Tilapia","c":"Fish & seafood","v":[["Raw",96,20.1,0,1.7],["Baked",128,26.2,0,2.7]]},{"n":"Cod","c":"Fish & seafood","v":[["Raw",82,17.8,0,0.7],["Baked",105,22.8,0,0.9]]},{"n":"Shrimp","c":"Fish & seafood","v":[["Raw",85,20.1,0,0.5],["Boiled",99,24,0.2,0.3]]},{"n":"Sardines","c":"Fish & seafood","v":[["Canned in oil",208,24.6,0,11.5]]},{"n":"Egg","c":"Eggs","v":[["Raw",143,12.6,0.7,9.5],["Boiled",155,12.6,1.1,10.6],["Fried",196,13.6,0.8,14.8],["Scrambled",149,9.9,1.6,11],["Boiled (1 large)",78,6.3,0.6,5.3,1,"PIECE"]]},{"n":"Egg white","c":"Eggs","v":[["Raw",52,10.9,0.7,0.2]]},{"n":"Milk (whole)","c":"Dairy","v":[["Plain",61,3.2,4.8,3.3,100,"MILLILITER"]]},{"n":"Milk (semi-skimmed)","c":"Dairy","v":[["Plain",50,3.3,4.8,1.9,100,"MILLILITER"]]},{"n":"Milk (skimmed)","c":"Dairy","v":[["Plain",34,3.4,5,0.1,100,"MILLILITER"]]},{"n":"Yogurt (plain, whole milk)","c":"Dairy","v":[["Plain",61,3.5,4.7,3.3]]},{"n":"Greek yogurt","c":"Dairy","v":[["Plain, non-fat",59,10.2,3.6,0.4],["Plain, whole milk",97,9,4,5]]},{"n":"Cheddar cheese","c":"Dairy","v":[["Plain",403,24.9,1.3,33.1]]},{"n":"Mozzarella","c":"Dairy","v":[["Part-skim",254,24.3,2.8,15.9]]},{"n":"Paneer","c":"Dairy","v":[["Plain",296,18.3,3.4,22.8]]},{"n":"Cottage cheese","c":"Dairy","v":[["Plain",98,11.1,3.4,4.3]]},{"n":"Ice cream","c":"Dairy","v":[["Vanilla",207,3.5,23.6,11]]},{"n":"White rice","c":"Grains & bread","v":[["Raw",365,7.1,80,0.7],["Boiled",130,2.7,28.2,0.3]]},{"n":"Brown rice","c":"Grains & bread","v":[["Raw",370,7.9,77.2,2.9],["Boiled",123,2.7,25.6,1]]},{"n":"Oats","c":"Grains & bread","v":[["Rolled, dry",379,13.2,67.7,6.5],["Cooked with water",71,2.5,12,1.5]]},{"n":"Wheat flour (white)","c":"Grains & bread","v":[["Raw",364,10.3,76.3,1]]},{"n":"Wheat flour (whole wheat)","c":"Grains & bread","v":[["Raw",340,13.2,72,2.5]]},{"n":"Bread (white)","c":"Grains & bread","v":[["Plain",265,9,49,3.2],["Plain (1 slice)",74,2.5,13.8,0.9,1,"PIECE"]]},{"n":"Bread (whole wheat)","c":"Grains & bread","v":[["Plain",252,12.5,43.1,3.5],["Plain (1 slice)",69,3.5,12,1,1,"PIECE"]]},{"n":"Naan","c":"Grains & bread","v":[["Plain",290,9,50.4,5.1]]},{"n":"Roti (chapati)","c":"Grains & bread","v":[["Whole wheat, no oil",264,9.6,48,3.7]]},{"n":"Pasta","c":"Grains & bread","v":[["Dry",371,13,74.7,1.5],["Boiled",158,5.8,30.9,0.9]]},{"n":"Egg noodles","c":"Grains & bread","v":[["Boiled",138,4.5,25,2.1]]},{"n":"Quinoa","c":"Grains & bread","v":[["Raw",368,14.1,64.2,6.1],["Boiled",120,4.4,21.3,1.9]]},{"n":"Couscous","c":"Grains & bread","v":[["Boiled",112,3.8,23.2,0.2]]},{"n":"Lentils","c":"Legumes","v":[["Dry",352,24.6,63.4,1.1],["Boiled",116,9,20.1,0.4]]},{"n":"Chickpeas","c":"Legumes","v":[["Dry",378,20.5,63,6],["Boiled",164,8.9,27.4,2.6]]},{"n":"Kidney beans","c":"Legumes","v":[["Dry",333,23.6,60,0.8],["Boiled",127,8.7,22.8,0.5]]},{"n":"Black beans","c":"Legumes","v":[["Boiled",132,8.9,23.7,0.5]]},{"n":"Mung beans","c":"Legumes","v":[["Dry",347,23.9,62.6,1.2],["Boiled",105,7,19.2,0.4]]},{"n":"Tofu","c":"Legumes","v":[["Raw",76,8.1,1.9,4.8]]},{"n":"Edamame","c":"Legumes","v":[["Boiled",121,11.9,8.9,5.2]]},{"n":"Hummus","c":"Legumes","v":[["Plain",166,7.9,14.3,9.6]]},{"n":"Almonds","c":"Nuts & seeds","v":[["Raw",579,21.2,21.6,49.9],["Dry roasted",598,22,21.4,52.5]]},{"n":"Walnuts","c":"Nuts & seeds","v":[["Raw",654,15.2,13.7,65.2]]},{"n":"Peanuts","c":"Nuts & seeds","v":[["Raw",567,25.8,16.1,49.2],["Roasted",585,23.7,21.5,49.7]]},{"n":"Cashews","c":"Nuts & seeds","v":[["Raw",553,18.2,30.2,43.9]]},{"n":"Pistachios","c":"Nuts & seeds","v":[["Raw",560,20.2,27.2,45.3]]},{"n":"Chia seeds","c":"Nuts & seeds","v":[["Dry",486,16.5,42.1,30.7]]},{"n":"Flax seeds","c":"Nuts & seeds","v":[["Dry",534,18.3,28.9,42.2]]},{"n":"Sunflower seeds","c":"Nuts & seeds","v":[["Dry",584,20.8,20,51.5]]},{"n":"Peanut butter","c":"Nuts & seeds","v":[["Smooth",588,25,20,50]]},{"n":"Olive oil","c":"Fats & oils","v":[["Plain",884,0,0,100]]},{"n":"Vegetable oil","c":"Fats & oils","v":[["Plain",884,0,0,100]]},{"n":"Coconut oil","c":"Fats & oils","v":[["Plain",892,0,0,99.1]]},{"n":"Butter","c":"Fats & oils","v":[["Plain",717,0.9,0.1,81.1]]},{"n":"Ghee","c":"Fats & oils","v":[["Plain",876,0.3,0,99.5]]},{"n":"Mayonnaise","c":"Fats & oils","v":[["Plain",680,1,0.6,75]]},{"n":"Water","c":"Beverages","v":[["Plain",0,0,0,0,100,"MILLILITER"]]},{"n":"Black tea","c":"Beverages","v":[["No sugar",1,0,0.3,0,100,"MILLILITER"]]},{"n":"Green tea","c":"Beverages","v":[["No sugar",1,0,0.2,0,100,"MILLILITER"]]},{"n":"Coffee","c":"Beverages","v":[["Black, no sugar",1,0.1,0,0,100,"MILLILITER"]]},{"n":"Orange juice","c":"Beverages","v":[["Plain",45,0.7,10.4,0.2,100,"MILLILITER"]]},{"n":"Apple juice","c":"Beverages","v":[["Plain",46,0.1,11.4,0.1,100,"MILLILITER"]]},{"n":"Cola","c":"Beverages","v":[["Regular",42,0,10.6,0,100,"MILLILITER"]]},{"n":"Coconut water","c":"Beverages","v":[["Plain",19,0.7,3.7,0.2,100,"MILLILITER"]]},{"n":"Dark chocolate","c":"Sweets & snacks","v":[["70-85% cocoa",598,7.8,45.9,42.6]]},{"n":"Milk chocolate","c":"Sweets & snacks","v":[["Plain",535,7.7,59.4,29.7]]},{"n":"Sugar","c":"Sweets & snacks","v":[["White",387,0,100,0]]},{"n":"Honey","c":"Sweets & snacks","v":[["Plain",304,0.3,82.4,0]]},{"n":"Potato chips","c":"Sweets & snacks","v":[["Plain, salted",536,7,52.9,34.6]]},{"n":"Popcorn","c":"Sweets & snacks","v":[["Air popped",387,12.9,77.8,4.5]]},{"n":"Jam","c":"Sweets & snacks","v":[["Plain",278,0.4,68.9,0.1]]},{"n":"Pizza","c":"Mixed dishes","v":[["Cheese, regular crust",266,11.4,33.3,10.4]]}]$json$;

  f jsonb;
  v jsonb;
  v_food uuid;
  v_new_foods integer := 0;
  v_new_preps integer := 0;
  v_rows integer;
begin
  for f in select * from jsonb_array_elements(v_data) loop
    select id into v_food from public.foods where lower(btrim(name)) = lower(f ->> 'n') limit 1;

    if v_food is null then
      insert into public.foods (name, category_id, published)
      values (
        f ->> 'n',
        coalesce(
          (select id from public.categories where lower(name) = lower(f ->> 'c') limit 1),
          (select id from public.categories where is_default)
        ),
        v_publish
      )
      returning id into v_food;
      v_new_foods := v_new_foods + 1;
    end if;

    for v in select * from jsonb_array_elements(f -> 'v') loop
      insert into public.food_variants (food_id, name, basis_amount, basis_unit, calories, protein_g, carbs_g, fat_g)
      values (
        v_food,
        v ->> 0,
        coalesce((v ->> 5)::numeric, 100),
        coalesce(v ->> 6, 'GRAM'),
        (v ->> 1)::numeric,
        (v ->> 2)::numeric,
        (v ->> 3)::numeric,
        (v ->> 4)::numeric
      )
      on conflict (food_id, lower(btrim(name))) do nothing;
      get diagnostics v_rows = row_count;
      v_new_preps := v_new_preps + v_rows;
    end loop;
  end loop;

  raise notice 'Added % new foods and % new preparations.', v_new_foods, v_new_preps;
end
$seed$;
