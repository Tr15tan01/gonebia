import { KnowledgeClient } from "@/components/knowledge-client";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const initialOpen = open && /^[0-9a-f-]{36}$/i.test(open) ? open : null;
  return <KnowledgeClient initialOpen={initialOpen} />;
}
