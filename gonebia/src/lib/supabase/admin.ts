import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Secret-key client. Background jobs only - always filter by user_id explicitly.
 *  Bypasses RLS; never expose to the client or use for user-facing reads. */
export function createAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}
