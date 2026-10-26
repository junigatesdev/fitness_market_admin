# Fitness Market Admin

Admin portal for the Fitness Market Android app (food database, meal ideas). Web app: Vite + React + TypeScript,
with [Supabase](https://supabase.com) for sign-in and data.

**Status:** real admin sign-in and a dashboard (sample numbers). Foods and meal ideas screens are next.

```bash
npm install
npm run dev        # http://localhost:5173/fitness_market_admin/
npm test
npm run build
```

## Supabase setup (once)

1. **Run the SQL.** Supabase dashboard → **SQL Editor** → New query → paste
   `supabase/migrations/0001_init.sql` → **Run**. It creates the tables and the security rules.
2. **Create your admin user.** **Authentication → Users → Add user** (email + password, tick *Auto Confirm User*).
3. **Make it an admin.** In the SQL Editor run (with your email):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
4. **Turn off public sign-ups.** **Authentication → Sign In / Providers → Email** → disable *Allow new users to sign up*.

Only users in `public.admins` can sign in to the portal and change data. Anyone (including the app) can read items
marked `published`.

## Keys

`src/supabase.ts` holds the project URL and the **publishable** key. They are public by design (they ship in every
web page); the row level security rules protect the data. **Never commit the `service_role` key or the database
password.** To point at another project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
