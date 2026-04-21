import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client (uses anon key, subject to RLS)
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
