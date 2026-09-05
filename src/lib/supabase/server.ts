import { cache } from "react";
import { auth } from "@/lib/auth";
import { scoped } from "@/lib/supabase/scoped";

// Most pages call both getUser() AND createClient() (sometimes more than
// once each, across a page + its child components) - each was independently
// calling Auth.js's auth(), which parses and verifies the session cookie
// every single time. React's cache() dedupes that to once per request
// automatically (safe: it's scoped to a single request/render pass, never
// shared across users or requests). This alone measurably speeds up pages
// that touch auth more than once, for free, with no behavior change.
const getSession = cache(() => auth());

/** Returns the logged-in user in the same {id, email} shape the app has
 *  always expected (previously from Supabase Auth, now from Auth.js) - kept
 *  identical on purpose so the ~30 call sites that already do
 *  `const user = await getUser(); if (!user) ...; user.id` keep working
 *  completely unchanged. `name` is additive (new) - it comes from the
 *  session for free (no extra DB query), since it was already being
 *  captured at sign-in/sign-up time and just wasn't being surfaced here. */
export async function getUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id as string,
    email: (session.user.email as string) ?? "",
    name: (session.user.name as string) || null,
  };
}

/** Returns a database client automatically scoped to the current user (see
 *  src/lib/supabase/scoped.ts for exactly what that means). This used to
 *  return Supabase's own RLS-respecting client; now that there's no
 *  Supabase-Auth session for RLS to check, this is what enforces per-user
 *  data isolation instead. Every existing call site that does
 *  `const sb = await createClient()` keeps working unchanged for ordinary
 *  reads/writes - only raw `.rpc()` calls need the user id passed explicitly
 *  (all of this app's own RPCs already take a `p_user` parameter for exactly
 *  this reason).
 *
 *  Throws if there's no session, rather than silently returning an unusable
 *  or unscoped client - every caller is expected to have already checked
 *  getUser() and returned 401 before reaching this. */
export async function createClient() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("createClient() called without an authenticated session - check getUser() first.");
  }
  return scoped(session.user.id as string);
}
