import { geminiJSON, geminiGroundedJSON } from "@/lib/ai/gemini";
import { MemoryRetrievalService } from "./retrieval";
import { assessActionabilitySafety, agentSafetyMessage } from "./safety";

export type AgentKind = "research" | "deep_research";
export const AGENT_KINDS: AgentKind[] = ["research", "deep_research"];

export interface Source { title: string; uri: string }

export interface AgentOutcome {
  result: Record<string, unknown>;
  sources: Source[];
  memoryIds: string[];
  grounded: boolean;
  safetyBlocked?: boolean;
}

/** Every agent entry point calls this FIRST, before spending any tokens.
 *  Same two-layer (regex + LLM classifier) check apply.ts uses for tasks. */
async function agentSafetyGate(text: string, userId: string, feature: string): Promise<AgentOutcome | null> {
  const assessment = await assessActionabilitySafety(text, { userId, feature });
  if (assessment.safe) return null;
  const message = agentSafetyMessage(assessment.kind!);
  return { result: { answer: message }, sources: [], memoryIds: [], grounded: false, safetyBlocked: true };
}

async function memoryContext(sb: any, userId: string, query: string, limit = 5): Promise<{ block: string; ids: string[] }> {
  try {
    const rows = await MemoryRetrievalService.hybrid(sb, userId, { query, limit, semantic: true });
    const ids = rows.map((r) => r.id);
    const block = rows.length
      ? rows.map((r, i) => `[M${i + 1}] (${(r.created_at ?? "").slice(0, 10)}) ${r.original_text.slice(0, 160)}`).join("\n")
      : "(none)";
    return { block, ids };
  } catch { return { block: "(none)", ids: [] }; }
}

function modelSources(data: any): Source[] {
  return Array.isArray(data?.sources)
    ? data.sources.filter((s: any) => typeof s?.uri === "string" && /^https?:\/\//.test(s.uri)).slice(0, 8)
    : [];
}

function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    if (!s?.uri || seen.has(s.uri)) return false;
    seen.add(s.uri);
    return true;
  });
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");

export const AgentService = {
  /** Online Research - one grounded pass, quick and visual. */
  async research(sb: any, userId: string, query: string): Promise<AgentOutcome> {
    const blocked = await agentSafetyGate(query, userId, "agent_research");
    if (blocked) return blocked;
    const { block, ids } = await memoryContext(sb, userId, query);
    const prompt = `You are an engaging research agent with web access. Research this topic for the user:
"${query}"

Context from the user's own memories (may be relevant, may be empty):
${block}

Return ONLY JSON:
{ "title": string (the topic as a short headline, max 8 words),
  "answer": string (direct answer, 2-5 sentences),
  "image_url": string|null (a real, directly-loadable https image URL - e.g. a Wikimedia
    thumbnail - that represents the topic; null if unsure),
  "key_points": [ { "point": string, "icon": string (ONE emoji) } ] (3-6),
  "surprising_fact": string|null,
  "try_this": string|null (one small concrete action; null if nothing fits),
  "so_what": string (practical implication for THIS user given their memories),
  "follow_up_questions": [string] (2-3),
  "tags": [string] (2-4 short lowercase topic tags) }`;
    try {
      const { data, sources } = await geminiGroundedJSON(prompt, "agent", { userId, feature: "agent_research" });
      return { result: data, sources, memoryIds: ids, grounded: true };
    } catch (e) {
      console.error("[agents] grounding unavailable, plain fallback:", e);
      const data = await geminiJSON<Record<string, unknown>>(prompt, "agent", { userId, feature: "agent_research" });
      return { result: data, sources: modelSources(data), memoryIds: ids, grounded: false };
    }
  },

  /** Deep Research - plan → parallel grounded investigation of several
   *  angles → cross-checked synthesis into a structured report. */
  async deepResearch(sb: any, userId: string, query: string): Promise<AgentOutcome> {
    const blocked = await agentSafetyGate(query, userId, "agent_deep_research");
    if (blocked) return blocked;
    const ctx = { userId, feature: "agent_deep_research" };
    const { block, ids } = await memoryContext(sb, userId, query, 6);

    // 1. plan
    let angles: { question: string; why: string }[] = [];
    try {
      const plan = await geminiJSON<{ angles?: { question?: string; why?: string }[] }>(
        `You are planning a deep research investigation.
TOPIC: "${query}"
USER CONTEXT (their own notes, may be empty):
${block}

Break the topic into 4 distinct, non-overlapping research angles that together give a
thorough, balanced picture (e.g. fundamentals/evidence, current state & numbers,
disagreements or risks, practical application). Each must be a concrete, searchable question.
Return ONLY JSON: { "angles": [ { "question": string, "why": string (max 12 words) } ] }`,
        "agent", ctx, { temperature: 0.3, maxTokens: 1024 },
      );
      angles = (plan.angles ?? [])
        .filter((a) => typeof a?.question === "string" && a.question.trim())
        .slice(0, 4)
        .map((a) => ({ question: a.question!.slice(0, 200), why: str(a.why, 120) }));
    } catch (e) {
      console.error("[deep-research] planning failed, using default angles:", e);
    }
    if (angles.length < 2) {
      angles = [
        { question: `${query} - what is the evidence and how does it work?`, why: "Fundamentals" },
        { question: `${query} - latest data, numbers and developments`, why: "Current state" },
        { question: `${query} - criticism, risks and open debates`, why: "Counterpoints" },
        { question: `${query} - practical recommendations`, why: "Application" },
      ];
    }

    // 2. investigate every angle in parallel
    const settled = await Promise.allSettled(angles.map((a) =>
      geminiGroundedJSON(
        `Research this question thoroughly using web search. Be specific: cite numbers, dates,
names of studies/organizations. Separate well-established facts from contested claims.
QUESTION: "${a.question}"
(Part of a broader investigation into: "${query}")

Return ONLY JSON:
{ "summary": string (3-4 sentences),
  "findings": [ { "claim": string, "detail": string, "strength": "strong"|"moderate"|"weak" } ] (3-5),
  "numbers": [ { "label": string, "value": string, "context": string } ] (0-3),
  "disagreements": string|null }`,
        "agent", ctx, { maxTokens: 2048 },
      ),
    ));

    const investigated = settled
      .map((r, i) => (r.status === "fulfilled" ? { angle: angles[i], ...r.value } : null))
      .filter(Boolean) as { angle: { question: string; why: string }; data: Record<string, unknown>; sources: Source[] }[];

    if (investigated.length === 0) {
      console.error("[deep-research] every angle failed - falling back to single-pass research");
      const quick = await AgentService.research(sb, userId, query);
      return { ...quick, result: { ...quick.result, _degraded: true } };
    }

    const sources = dedupeSources(investigated.flatMap((i) => i.sources)).slice(0, 20);
    const sourceList = sources.map((s, i) => `[S${i + 1}] ${s.title} - ${s.uri}`).join("\n") || "(no source list)";
    const notes = investigated.map((inv, i) =>
      `### Angle ${i + 1}: ${inv.angle.question}\n${JSON.stringify(inv.data).slice(0, 5000)}`
    ).join("\n\n");

    // 3. synthesize
    const report = await geminiJSON<Record<string, unknown>>(
      `You are a senior research analyst writing a deep research report for one person.

TOPIC: "${query}"

RESEARCH NOTES from ${investigated.length} independent web investigations:
${notes}

SOURCES FOUND:
${sourceList}

THE USER'S OWN RELATED NOTES (use only to personalize, never as evidence):
${block}

Cross-check the notes against each other. Where they agree, state it confidently; where they
conflict, say so plainly. Never invent statistics that are not in the notes. Write clearly,
no filler, no marketing tone.

Return ONLY JSON:
{ "title": string (report headline, max 10 words),
  "answer": string (executive summary, 4-6 sentences - the bottom line first),
  "key_points": [ { "point": string, "icon": string (ONE emoji) } ] (4-6),
  "sections": [ { "heading": string, "icon": string (ONE emoji), "body": string (2 short paragraphs separated by \\n\\n) } ] (3-5),
  "key_numbers": [ { "label": string, "value": string, "context": string } ] (0-4),
  "debates": [ { "question": string, "sides": string } ] (0-3, genuine open disagreements),
  "confidence": { "level": "high"|"medium"|"low", "reason": string },
  "surprising_fact": string|null,
  "try_this": string|null,
  "so_what": string (what this means for THIS user specifically),
  "follow_up_questions": [string] (3),
  "tags": [string] (2-5 short lowercase topic tags) }`,
      "agent", ctx, { maxTokens: 8192, temperature: 0.3 },
    );

    return {
      result: {
        ...report,
        angles: investigated.map((i) => ({ question: i.angle.question, why: i.angle.why })),
        angles_failed: angles.length - investigated.length,
      },
      sources,
      memoryIds: ids,
      grounded: true,
    };
  },
};
