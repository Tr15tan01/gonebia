import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { geminiGroundedJSON } from "@/lib/ai/gemini";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily price re-check for active watches. HONEST LIMITATION: prices are
 *  estimated from web search results, not a live merchant feed - the
 *  notification always says so. Deals = >=10% drop or target crossed. */
async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdmin();
  const { data: watches } = await admin
    .from("price_watches").select("*").eq("status", "active").limit(50);
  let checked = 0, alerted = 0;

  for (const w of watches ?? []) {
    try {
      const { data } = await geminiGroundedJSON(
        `What is the current typical online retail price for: "${w.query}"? ` +
        `Return ONLY JSON: { "estimated_price": number|null, "currency": string, "source_url": string|null, "note": string }`
      );
      const price = typeof data.estimated_price === "number" ? data.estimated_price : null;
      checked++;
      const today = new Date().toISOString().slice(0, 10);
      await admin.from("price_watches").update({
        last_price: price, last_url: (data.source_url as string) ?? null,
        last_checked: new Date().toISOString(),
      }).eq("id", w.id);
      if (price === null) continue;

      const hitTarget = w.target_price && price <= Number(w.target_price);
      const dropped = w.last_price && price <= Number(w.last_price) * 0.9;
      if (!hitTarget && !dropped) continue;

      const notif = await createNotification(admin, {
        userId: w.user_id, kind: "price_watch",
        title: `Price watch: ${w.query}`,
        body: `Estimated ${price} (web estimate, not live). ${hitTarget ? "Your target price was reached." : "Down ~10%+ from last check."}`,
        url: "/agents", dedupeKey: `watch:${w.id}:${today}`,
      });
      if (notif) alerted++;
    } catch (e) {
      console.error("[pricewatch]", w.id, e);
    }
  }
  return NextResponse.json({ checked, alerted });
}
export const GET = handle;
export const POST = handle;
