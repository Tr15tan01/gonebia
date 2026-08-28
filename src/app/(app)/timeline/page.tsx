import { fetchTimeline } from "@/lib/queries";
import { TimelineClient } from "@/components/timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const initial = await fetchTimeline({});
  return <TimelineClient initial={initial} />;
}
