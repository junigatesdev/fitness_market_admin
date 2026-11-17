-- Fitness Market: put the 6 starter meals (seed-meals.sql) into the starter meal categories.
-- Run in Supabase: SQL Editor > New query > paste all > Run.
-- Needs: migration 0011 (or setup-all.sql) and seed-meals.sql to have been run first.
--
-- Safe to run again: a link that already exists is skipped, and a meal or category that is not found (renamed or
-- deleted) is skipped. Nothing you changed or made is overwritten or removed.

insert into public.meal_category_links (meal_id, category_id)
select m.id, c.id
from (values
  ('Grilled Chicken & Rice Bowl', 'High protein'),
  ('Grilled Chicken & Rice Bowl', 'Western'),
  ('Oats & Banana Breakfast', 'Western'),
  ('Veggie Egg Scramble', 'High protein'),
  ('Veggie Egg Scramble', 'Western'),
  ('Lentil & Roti Lunch', 'Indian'),
  ('Lentil & Roti Lunch', 'Eastern'),
  ('Salmon & Sweet Potato', 'High protein'),
  ('Salmon & Sweet Potato', 'Western'),
  ('Greek Yogurt Parfait', 'High protein')
) as t (meal_name, category_name)
join public.meals m on m.name = t.meal_name
join public.meal_categories c on lower(btrim(c.name)) = lower(t.category_name)
on conflict do nothing;
