import { fetchTimeline } from "@/lib/queries";
import { TimelineClient } from "@/components/timeline";
import { MEMORY_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ type?: string; memory?: string }> }) {
  const { type, memory } = await searchParams;
  const initialTypes = (type ?? "").split(",").filter((t) => (MEMORY_TYPES as readonly string[]).includes(t));
  const initial = await fetchTimeline({ types: initialTypes });
  // key forces a fresh client state when arriving from a different filter link
  const openMemoryId = memory && /^[0-9a-f-]{36}$/i.test(memory) ? memory : null;
  return <TimelineClient key={initialTypes.join(",")} initial={initial} initialTypes={initialTypes} openMemoryId={openMemoryId} />;
}
