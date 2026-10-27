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

## Keys

`src/supabase.ts` holds the project URL and the **publishable** key. They are public by design (they ship in every
web page); the row level security rules protect the data. **Never commit the `service_role` key or the database
password.** To point at another project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
