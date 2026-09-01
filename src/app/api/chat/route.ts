import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { chatSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { AIChatService } from "@/lib/services/chat";
import { getPlan, getUsage, bumpChatUsage, LIMITS } from "@/lib/limits";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`chat:${user.id}`, 20, 3600_000)) {
    return NextResponse.json(
      { error: "You've asked a lot of questions this hour - let's pause a moment." },
      { status: 429 }
    );
  }
  const { messages, timezone } = chatSchema.parse(await req.json());
  const sb = await createClient();

  // server-side AI question limits (daily + monthly)
  const plan = await getPlan(sb, user.id);
  const lim = LIMITS[plan];
  const usage = await getUsage(sb, user.id);
  if (usage.chatToday >= lim.chatPerDay) {
    return NextResponse.json({
      error: `You've used all ${lim.chatPerDay} AI questions for today on the ${plan === "free" ? "Free" : "Pro"} plan. ${plan === "free" ? "Upgrade to Pro for 500/month." : "They reset at midnight."}`,
      code: "limit", feature: "chat", limit: lim.chatPerDay, period: "day", upgrade: plan === "free",
    }, { status: 402 });
  }
  if (usage.chatMonth >= lim.chatPerMonth) {
    return NextResponse.json({
      error: `You've used all ${lim.chatPerMonth} AI questions this month on the ${plan === "free" ? "Free" : "Pro"} plan. ${plan === "free" ? "Upgrade to Pro for 500/month." : "They reset next month."}`,
      code: "limit", feature: "chat", limit: lim.chatPerMonth, period: "month", upgrade: plan === "free",
    }, { status: 402 });
  }

  try {
    const result = await AIChatService.answer(sb, messages, timezone, plan);
    await bumpChatUsage(sb, user.id);
    const ph = getPostHogClient();
    if (ph) {
      ph.capture({
        distinctId: user.id,
        event: "chat_answered_server",
        properties: {
          plan,
          reference_count: (result as any).references?.length ?? 0,
          turn_number: messages.filter((m: any) => m.role === "user").length,
        },
      });
      await ph.flush();
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[chat]", e);
    return NextResponse.json({
      answer: "I couldn't search your memories just now. Please try again.",
      references: [],
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
