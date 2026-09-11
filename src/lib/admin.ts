import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
}

/** Call at the top of every /admin page and every /api/admin/* route.
 *  Always hits the DB directly with the service-role client - never trusts
 *  a role embedded in the session JWT, so revoking admin access takes effect
 *  on the very next request rather than waiting for a token to expire. */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  const admin = createAdmin();
  const { data } = await admin.from("users").select("id, email, full_name, role, disabled_at").eq("id", user!.id).maybeSingle();
  if (!data || data.role !== "admin" || data.disabled_at) {
    redirect("/dashboard");
  }
  return { id: data.id, email: data.email, name: data.full_name };
}

/** Same check for API routes, which should return 403 JSON rather than
 *  redirect. Returns null (not admin) instead of throwing, so callers
 *  decide the response shape themselves. */
export async function requireAdminApi(): Promise<AdminUser | null> {
  const user = await getUser();
  if (!user) return null;
  const admin = createAdmin();
  const { data } = await admin.from("users").select("id, email, full_name, role, disabled_at").eq("id", user!.id).maybeSingle();
  if (!data || data.role !== "admin" || data.disabled_at) return null;
  return { id: data.id, email: data.email, name: data.full_name };
}

export async function logAdminAction(adminUserId: string, targetUserId: string | null, action: string, details?: Record<string, unknown>) {
  const admin = createAdmin();
  const { error } = await admin.from("admin_audit_log").insert({
    admin_user_id: adminUserId, target_user_id: targetUserId, action, details: details ?? null,
  });
  if (error) console.error("[admin] audit log insert failed:", error);
}
