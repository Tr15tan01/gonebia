import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser, createClient } from "@/lib/supabase/server";

const mergeSchema = z.object({
  target_id: z.string().uuid(),
  source_ids: z.array(z.string().uuid()).min(1).max(20),
  name: z.string().trim().min(1).max(120).optional(),
});

/** Merge one or more duplicate "people" rows (e.g. "Nico" and "Nico - my
 *  cousin" mentioned separately) into a single target. Every memory tagged
 *  with a source person gets re-tagged with the target instead - no memory
 *  or thought is deleted, only the person records are combined. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { target_id, source_ids, name } = mergeSchema.parse(await req.json());
  const ids = source_ids.filter((id) => id !== target_id);
  if (!ids.length) return NextResponse.json({ error: "nothing to merge" }, { status: 400 });

  const sb = await createClient();

  const { data: people, error: fetchErr } = await sb
    .from("people").select("id, last_mentioned_at, first_seen_at")
    .in("id", [target_id, ...ids]);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  const target = (people ?? []).find((p: any) => p.id === target_id);
  if (!target) return NextResponse.json({ error: "target person not found" }, { status: 404 });

  // Re-point every memory_people link from a source person to the target.
  // Upsert (not update) so a memory already linked to both doesn't collide
  // on the (memory_id, person_id) primary key.
  const { data: links, error: linksErr } = await sb
    .from("memory_people").select("memory_id, user_id").in("person_id", ids);
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 400 });
  if (links && links.length) {
    const { error: upsertErr } = await sb.from("memory_people").upsert(
      links.map((l: any) => ({ memory_id: l.memory_id, person_id: target_id, user_id: l.user_id })),
      { onConflict: "memory_id,person_id", ignoreDuplicates: true }
    );
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  // keep the most recent "last mentioned" across everything being merged
  const latest = [target, ...(people ?? []).filter((p: any) => ids.includes(p.id))]
    .map((p: any) => p.last_mentioned_at).sort().at(-1);
  const patch: Record<string, unknown> = { last_mentioned_at: latest };
  if (name?.trim()) { patch.name = name.trim(); patch.normalized = name.trim().toLowerCase(); }
  const { error: updateErr } = await sb.from("people").update(patch).eq("id", target_id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  // the FK on memory_people is "on delete cascade", but we've already
  // re-pointed every link above, so this only removes the now-empty
  // duplicate person records themselves.
  const { error: deleteErr } = await sb.from("people").delete().in("id", ids);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: target_id });
}
