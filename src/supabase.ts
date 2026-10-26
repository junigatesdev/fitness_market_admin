import { createClient } from '@supabase/supabase-js';

// The project URL and publishable key are public by design: they ship in every web page. Access is
// controlled by the row level security rules in supabase/migrations, not by hiding these values.
// NEVER put the service_role key or the database password in this repo.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://tctpupltadqesehszgjc.supabase.co';
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_GNqEgZaohhOdVTLPAdAtGg_1O4gVDxs';

export const supabase = createClient(url, publishableKey);
