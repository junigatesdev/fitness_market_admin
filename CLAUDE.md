# Fitness Market Admin (portal)

Web admin portal for the Fitness Market Android app. Vite + React + TypeScript; Supabase for sign-in and data.
The Android app lives in the separate repo `junigatesdev/fitnessmarket` and reads what is published here.

## How to work with the owner
- **Do not build until they say "go".** Questions and plans are fine; code, pushes and SQL are not, until told.
- Ask before design decisions that change the data model (use a short multiple-choice question). Give a recommendation.
- Plain language, short answers. They run commands on **Windows** (PowerShell) at `D:\FitnessMarket\...`.
- Say plainly what was and was not verified. Never present mocked results as real ones.

## Git rules
- Develop on the session's `claude/...` branch, commit, push. **After finishing work, also fast-forward `main`**
  (`git push origin HEAD:refs/heads/main`) so new branches start from the latest work. If `main` has commits the
  branch lacks, merge `main` into the branch first. Never force-push or rewrite history.
- Do not open pull requests unless asked.
- Before starting, `git fetch` and list remote branches (`git branch -r`). Unmerged work may exist (it did once, on the
  Android repo). Tell the owner and merge it when asked.

## Supabase (project `tctpupltadqesehszgjc`, https://tctpupltadqesehszgjc.supabase.co)
- The URL and the **publishable** key in `src/supabase.ts` are public by design. **NEVER put the `service_role` key or the
  database password in this repo, in chat, or in code.** Do not ask for them.
- Cloud sessions **cannot reach Supabase** (network policy) and have no login. So you cannot read or write the live
  database. To change data or schema: write SQL **for the owner to paste in Supabase > SQL Editor**, and say which file to run.
  The owner can add Supabase's read-only MCP connector or allow the host to give a future session read access.
- Schema files, run in order on a new project (`supabase/setup-all.sql` is 0001-0007 joined for one paste):
  `0001_init` (admins, foods, food_variants, RLS) · `0002_save_food` · `0003_meals` · `0004_categories` · `0005_world_areas` · `0006_hot_meals` · `0007_exercises`.
  **Ship order matters:** the portal deploys the moment it is pushed, so a portal change that needs new tables/columns must
  keep working when the migration has not been run yet (degrade gracefully with a notice), and the owner must be told to run
  the SQL first.
  New schema change = a **new numbered migration** (never edit one that was already run) AND append it to `setup-all.sql`.
- Starter data: `seed-foods.sql` (115 foods, approximate values), `seed-food-areas.sql` `seed-meals.sql` (6 meals) and `seed-exercises.sql` (24 exercises). Seeds must stay idempotent
  (re-running adds nothing) and must never overwrite the owner's own foods.
- **Test SQL before handing it over.** Postgres 16 server binaries exist at `/usr/lib/postgresql/16/bin` (start as user
  `postgres`). Create stand-ins for Supabase (`anon` / `authenticated` roles, an `auth.users` table, `auth.uid()` reading
  `request.jwt.claim.sub`), run the migrations, then test as admin, non-admin and anon.

## Data model (what the Android app relies on)
- `foods` -> many `food_variants` (preparations like Raw, Home cooked, Air fried; nutrition per `basis_amount` of
  `basis_unit` GRAM|MILLILITER|PIECE|SERVING). Each food has one `category_id` (managed `categories`; "Food" is the
  undeletable default and receives foods of a deleted category) and any number of `world_areas` tags (`food_world_areas`).
- `meals` -> `meal_items` -> `food_variants`. A meal's calories/macros are **always computed** from its foods, never typed.
  `meals.is_hot` + `hot_order` mark the meals the app shows on Home, in that order; only **published** meals can be hot
  (unpublishing clears it). Meal kinds: Fitness Market meals (this portal, read-only for customers), the customer's own
  "My meals" (on the phone), and shared user meals (future; needs accounts).
  A food/preparation used by a meal **cannot be deleted** (blocked, naming the meals). A **published meal may only use
  published foods** (the app cannot read drafts).
- RLS: anon and non-admins read **published** foods/meals only (variants, items, tags follow their parent); categories
  and areas are readable by all; only users in `admins` can write. Writes go through `save_food`, `save_meal`,
  `delete_category`, `reorder_*` (all `security invoker`, so RLS still applies).

## Exercises (for the app's Workout tab; the app does not read them yet)
- `exercises` have one `muscle_groups` row ("Other" is the undeletable default and receives the exercises of a deleted
  group), any number of `exercise_tags` (workout days such as "Chest day") through `exercise_tag_links`, equipment (free
  text), difficulty, how-to text, `measure` REPS|SECONDS, `default_sets`, `default_target` (reps or seconds) and
  `uses_weight`. Anon and non-admins read **published** exercises only. Writes go through `save_exercise` (replaces
  the tags in one transaction), `delete_muscle_group`, `reorder_*`.
- The customer's own sets/reps/weight and logged workouts live on the phone and are snapshots; nothing here stores them.
- No pictures yet (the app shows one placeholder). Storage for pictures/GIFs is still undecided.

## Portal
- Login = real Supabase email/password **and** a row in `public.admins`. There is no temporary login.
- Screens: Foods, Categories, World areas, Meals, Exercises (real); Dashboard (sample numbers); Users, Settings (placeholders).
- Commands: `npm install`, `npm run dev` (http://localhost:5173/fitness_market_admin/), `npm test`, `npm run typecheck`, `npm run build`.
- Deploy: `.github/workflows/deploy-pages.yml` publishes to GitHub Pages **from the `claude/admiring-cannon-thmsax`
  branch** (the Pages environment only allows `main` and that branch). Pages needs a public repo on the free plan.
- Tests use mocked data layers; after changing UI, also check it visually at phone and desktop widths.

## Known gaps
Dashboard shows sample numbers; Users/Settings are placeholders; unpublishing a food used by a published meal is not
blocked; admin password should be strong; no CSV import yet; the Android app does not sync meals, categories or areas yet.
