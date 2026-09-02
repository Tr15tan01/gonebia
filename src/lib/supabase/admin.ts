import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Service-role client. Background jobs only - always filter by user_id explicitly.
 *  Bypasses RLS; never expose to the client or use for user-facing reads. */
export function createAdmin() {
  // NOTE: .env.example documents this as SUPABASE_SECRET_KEY (Supabase's newer
  // dashboard naming), but this file previously only read
  // SUPABASE_SERVICE_ROLE_KEY - a real deployment following .env.example would
  // silently pass `undefined` as the key, breaking every admin-client write
  // (capture's metadata insert, agent run history, Google token storage,
  // reminders, cron jobs...) with no obvious error pointing at the cause.
  // Accept either name so this works regardless of which one is actually set.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) env var");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } }
  );
}
