# Fitness Market Admin

Admin portal for the Fitness Market Android app (food database, meal ideas). Web app: Vite + React + TypeScript,
with [Supabase](https://supabase.com) for sign-in and data.

**Status:** admin sign-in, dashboard (sample numbers), and screens for Foods, Categories, World areas and Meals.

```bash
npm install
npm run dev        # http://localhost:5173/fitness_market_admin/
npm test
npm run build
```

## Supabase setup (once)

1. **Run the SQL.** Easiest: paste all of `supabase/setup-all.sql` into a new query and Run (it is the six files below joined, for a new project). Or run the files separately, in order. Supabase dashboard → **SQL Editor** → New query → paste a file → **Run**. Repeat for each:
   1. `supabase/migrations/0001_init.sql`: tables and security rules
   2. `supabase/migrations/0002_save_food.sql`: saving a food and its preparations in one step
   3. `supabase/migrations/0003_meals.sql`: meals built from foods
   4. `supabase/migrations/0004_categories.sql`: managed categories
   5. `supabase/migrations/0005_world_areas.sql`: world areas (food cultures) as tags on foods
   6. `supabase/migrations/0006_hot_meals.sql`: "hot" meals shown on the app's Home screen, with an order
   7. `supabase/migrations/0007_exercises.sql`: exercises with muscle groups and tags, for the app's Workout tab
   8. `supabase/migrations/0008_default_days.sql`: default workout days (a tree of groups and exercises) copied to new customers
   9. `supabase/migrations/0009_drinks.sql`: drinks (tea, milk tea, coffee) with cup size, milk and sugar choices, for the app's Add food > Drinks row
   10. `supabase/migrations/0010_piece_sizes.sql`: optional piece size per preparation (one egg white = 33 g), so the app can count pieces
2. **Create your admin user.** **Authentication → Users → Add user** (your email + a strong password, tick *Auto Confirm User*).
3. **Make it an admin.** In the SQL Editor run (with your email):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
4. **Turn off public sign-ups.** **Authentication → Sign In / Providers → Email** → disable *Allow new users to sign up*.

Only users in `public.admins` can sign in to the portal and change data. Anyone (including the app) can read items
marked `published`.

## Starter data (optional)

- `supabase/seed-foods.sql`: 115 general foods with 162 preparations (approximate reference values, review before relying on them). Safe to re-run.
- `supabase/seed-food-areas.sql`: tags those foods with world areas (Global, Western, South Asian, ...). Run after `0005`. Safe to re-run.
- `supabase/seed-exercises.sql`: 24 starter exercises (published) with muscle groups, equipment, defaults and tags. Run after `0007`. Safe to re-run.
- `supabase/seed-default-days.sql`: 4 starter days (Upper body, Lower body, Push, Pull) from the starter exercises. Run after `0008` and `seed-exercises.sql`. Safe to re-run.
- `supabase/seed-drinks.sql`: 4 drinks (Chay / Milk tea, Black tea, Coffee, Latte) using the starter milk and sugar foods. Run after `0009` and `seed-foods.sql`. Safe to re-run.
- `supabase/seed-piece-sizes.sql`: piece sizes for 15 starter preparations (egg white, egg, roti, naan, almonds, milk glass ...). Run after `0010` and `seed-foods.sql`. Safe to re-run; never changes a piece size you set.
- `supabase/seed-meals.sql`: 6 meals built from the starter foods, published and hot. Run after `0006` and `seed-foods.sql`. Safe to re-run.

## Keys

`src/supabase.ts` holds the project URL and the **publishable** key. They are public by design (they ship in every
web page); the row level security rules protect the data. **Never commit the `service_role` key or the database
password.** To point at another project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
