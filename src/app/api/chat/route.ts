import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { chatSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { AIChatService } from "@/lib/services/chat";

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
  try {
    return NextResponse.json(await AIChatService.answer(sb, messages, timezone));
  } catch (e) {
    console.error("[chat]", e);
    return NextResponse.json({
      answer: "Something went wrong reaching my language model. Please try again.",
      references: [],
    });
  }
}
