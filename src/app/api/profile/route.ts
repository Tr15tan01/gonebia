import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { prefsSchema } from "@/lib/validation";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    sb.from("user_preferences").select("*").eq("user_id", user.id).single(),
    sb.from("profiles").select("timezone, full_name, email").eq("id", user.id).single(),
  ]);
  return NextResponse.json({ prefs, profile });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = prefsSchema.parse(await req.json());
  const sb = await createClient();
  if (p.timezone) await sb.from("profiles").update({ timezone: p.timezone }).eq("id", user.id);
  const { theme, quiet_hours_start, quiet_hours_end, push_enabled, insight_sensitivity } = p;
  const prefPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (theme !== undefined) prefPatch.theme = theme;
  if (quiet_hours_start !== undefined) prefPatch.quiet_hours_start = quiet_hours_start;
  if (quiet_hours_end !== undefined) prefPatch.quiet_hours_end = quiet_hours_end;
  if (push_enabled !== undefined) prefPatch.push_enabled = push_enabled;
  if (insight_sensitivity !== undefined) prefPatch.insight_sensitivity = insight_sensitivity;
  const { error } = await sb.from("user_preferences").update(prefPatch).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
