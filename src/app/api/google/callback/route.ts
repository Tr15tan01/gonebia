import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { googleConfigured } from "@/lib/services/google";

/** Exchanges the code server-side (client secret never leaves the server),
 *  decodes id_token ONLY to read sub/email (token came directly from Google
 *  over TLS, so no signature verification needed here), stores refresh token. */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("g_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/settings?google=error", req.url));
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=notconfigured", req.url));
  }

  try {
    const c = {
      id: process.env.GOOGLE_CLIENT_ID!,
      secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") + "/api/google/callback",
    };
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: c.id, client_secret: c.secret,
        redirect_uri: c.redirect, grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const tok = await tokenRes.json();

    let sub: string | null = null, email: string | null = null;
    if (tok.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64").toString());
        sub = payload.sub ?? null;
        email = payload.email ?? null;
      } catch {}
    }

    const admin = createAdmin();
    await admin.from("google_integrations").upsert({
      user_id: user.id,
      google_sub: sub,
      email,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null, // only present with prompt=consent
      token_expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      scopes: (tok.scope ?? "").split(" ").filter(Boolean),
      updated_at: new Date().toISOString(),
    });

    const res = NextResponse.redirect(new URL("/settings?google=connected", req.url));
    res.cookies.delete("g_state");
    return res;
  } catch (e) {
    console.error("[google/callback]", e);
    return NextResponse.redirect(new URL("/settings?google=error", req.url));
  }
}
