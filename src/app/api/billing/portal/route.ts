import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

/** Creates a Paddle customer portal session for cancellation/invoices. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Billing portal isn't configured (needs PADDLE_API_KEY)." }, { status: 501 });

  const sb = await createClient();
  const { data: sub } = await sb.from("subscriptions").select("paddle_customer_id").eq("user_id", user.id).single();
  if (!sub?.paddle_customer_id) {
    return NextResponse.json({ error: "No billing profile found - subscribe first." }, { status: 404 });
  }
  const res = await fetch(`https://api.paddle.com/customers/${sub.paddle_customer_id}/portal-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) return NextResponse.json({ error: "Couldn't open the portal - try again." }, { status: 500 });
  const json = await res.json();
  const general = json?.data?.urls?.general;
  const url = typeof general === "string" ? general : general?.overview;
  return NextResponse.json({ url });
}
