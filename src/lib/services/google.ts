import { createAdmin } from "@/lib/supabase/admin";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly", // READ-ONLY by design
];

function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  const redirect = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") + "/api/google/callback";
  return { id, secret, redirect };
}

export function googleConfigured(): boolean {
  return credentials() !== null;
}

export function buildAuthUrl(state: string): string {
  const c = credentials()!;
  const params = new URLSearchParams({
    client_id: c.id,
    redirect_uri: c.redirect,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",   // refresh token
    prompt: "consent",        // force refresh token even if previously granted
    include_granted_scopes: "false",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const c = credentials()!;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Valid access token for the user, refreshing when needed. Null if not connected. */
export async function getAccessToken(userId: string): Promise<string | null> {
  const admin = createAdmin();
  const { data: row } = await admin.from("google_integrations").select("*").eq("user_id", userId).single();
  if (!row?.refresh_token) return null;
  if (row.token_expires_at && new Date(row.token_expires_at) > new Date(Date.now() + 60_000)) {
    return row.access_token;
  }
  try {
    const c = credentials()!;
    const tok = await tokenRequest({
      client_id: c.id, client_secret: c.secret,
      refresh_token: row.refresh_token, grant_type: "refresh_token",
    });
    await admin.from("google_integrations").update({
      access_token: tok.access_token,
      token_expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    return tok.access_token;
  } catch (e) {
    console.error("[google] refresh failed:", e);
    return null;
  }
}

export interface CalendarEvent { id: string; title: string; start: string; end: string; location?: string }

export async function listUpcomingEvents(userId: string, days = 14, max = 10): Promise<CalendarEvent[]> {
  const token = await getAccessToken(userId);
  if (!token) return [];
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=${max}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar list ${res.status}`);
  const json = await res.json();
  return (json.items ?? []).map((it: any) => ({
    id: it.id,
    title: it.summary ?? "(untitled)",
    start: it.start?.dateTime ?? it.start?.date ?? "",
    end: it.end?.dateTime ?? it.end?.date ?? "",
    location: it.location,
  }));
}

export async function createCalendarEvent(
  userId: string, ev: { title: string; start: string; end?: string; description?: string }
): Promise<CalendarEvent> {
  const token = await getAccessToken(userId);
  if (!token) throw new Error("Google not connected");
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 3600_000);
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.title,
      description: ev.description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`Calendar create ${res.status}`);
  const it = await res.json();
  return { id: it.id, title: it.summary ?? ev.title, start: it.start?.dateTime ?? "", end: it.end?.dateTime ?? "" };
}

export interface MailHit { id: string; subject: string; date: string; snippet: string }

/** Gmail READ-ONLY search: metadata + snippet only. No bodies are fetched,
 *  and no send/modify scope exists to begin with. */
export async function searchGmail(userId: string, query: string, max = 5): Promise<MailHit[]> {
  const token = await getAccessToken(userId);
  if (!token) return [];
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(`Gmail search ${listRes.status}`);
  const list = await listRes.json();
  const hits: MailHit[] = [];
  for (const m of list.messages ?? []) {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) continue;
    const msg = await r.json();
    const headers = msg?.payload?.headers ?? [];
    hits.push({
      id: msg.id,
      subject: headers.find((h: any) => h.name === "Subject")?.value ?? "(no subject)",
      date: headers.find((h: any) => h.name === "Date")?.value ?? "",
      snippet: msg.snippet ?? "",
    });
  }
  return hits;
}
