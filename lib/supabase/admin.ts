import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client (spec §14): server-only, bypasses RLS. Used to
// create crew auth accounts (no public signup). NEVER import into client code.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
