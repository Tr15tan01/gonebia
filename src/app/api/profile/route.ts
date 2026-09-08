import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/limits";
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
  const { theme, accent_color, quiet_hours_start, quiet_hours_end, push_enabled, insight_sensitivity } = p;
  if (accent_color && accent_color !== "amber") {
    // Defense in depth: the Settings UI already disables non-amber swatches
    // for Free, but the API is the actual boundary - never trust the client
    // for a paid-feature gate.
    const plan = await getPlan(sb, user.id);
    if (plan === "free") {
      return NextResponse.json({ error: "Custom accent colors are a Premium/Pro feature.", code: "limit", upgrade: true }, { status: 402 });
    }
  }
  const prefPatch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (theme !== undefined) prefPatch.theme = theme;
  if (accent_color !== undefined) prefPatch.accent_color = accent_color;
  if (quiet_hours_start !== undefined) prefPatch.quiet_hours_start = quiet_hours_start;
  if (quiet_hours_end !== undefined) prefPatch.quiet_hours_end = quiet_hours_end;
  if (push_enabled !== undefined) prefPatch.push_enabled = push_enabled;
  if (insight_sensitivity !== undefined) prefPatch.insight_sensitivity = insight_sensitivity;
  // upsert (not update): a plain update silently affects 0 rows - and reports
  // NO error - if this user somehow never got a user_preferences row (e.g. an
  // older account from before the auto-create trigger existed), which is
  // exactly what made sensitivity/other prefs LOOK saved (toast said so) but
  // never actually persist.
  const { error } = await sb.from("user_preferences").upsert(prefPatch, { onConflict: "user_id" });
  if (error) {
    console.error("[profile] preferences upsert failed:", error);
    Sentry.captureException(error, { extra: { userId: user.id, patch: prefPatch } });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
