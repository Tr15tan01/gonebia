import { geminiJSON, geminiGroundedJSON } from "@/lib/ai/gemini";
import { MemoryRetrievalService } from "./retrieval";
import { assessActionabilitySafety, agentSafetyMessage } from "./safety";
import { aiOutageOf } from "@/lib/ai/errors";

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

/** Gives up on a slow call (the request itself isn't cancelled, its result
 *  is just ignored) - deep research has to finish inside the route's 300s. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/* Deep research time budget, measured from the start of the run. The route
 * allows 300s; the report itself can take a minute to write. */
const ANGLE_TIMEOUT_MS = 100_000;
const FOLLOW_UP_CUTOFF_MS = 120_000;  // no second round if round one ran long
const FOLLOW_UP_TIMEOUT_MS = 60_000;
const RETRY_SYNTHESIS_CUTOFF_MS = 225_000;

/** Thinking models spend part of maxOutputTokens on reasoning (a grounded
 *  angle measured ~2.8k thinking tokens) - without this headroom the JSON
 *  is cut off mid-string and the step fails as "unparseable". */
const THINKING_ROOM = 8000;

interface Angle { question: string; why: string; round: 1 | 2 }
interface Investigated { angle: Angle; data: Record<string, unknown>; sources: Source[] }

/** One grounded web investigation of a single question. */
function investigate(a: Angle, query: string, today: string, ctx: { userId: string; feature: string }, timeoutMs: number) {
  return withTimeout(geminiGroundedJSON(
    `Research this question thoroughly using web search. Today is ${today} - prefer the most
recent information and say how recent it is. Be specific: cite numbers, dates, names of
studies, organizations and people. Separate well-established facts from contested claims.
QUESTION: "${a.question}"
(Part of a broader investigation into: "${query}")

Return ONLY JSON:
{ "summary": string (4-6 sentences),
  "findings": [ { "claim": string, "detail": string (2-3 sentences of evidence), "strength": "strong"|"moderate"|"weak" } ] (4-6),
  "numbers": [ { "label": string, "value": string, "context": string } ] (0-4),
  "dates": [ { "date": string, "event": string } ] (0-4, only if the topic has a chronology),
  "disagreements": string|null,
  "unanswered": string|null (what you could NOT find or verify) }`,
    "agent", ctx, { maxTokens: THINKING_ROOM + 4000 },
  ), timeoutMs);
}

/** "[S2] [S5]" in report text -> the sources it may cite: the ones found by
 *  the investigation each note came from. */
function notesWithSources(list: Investigated[], sources: Source[]): string {
  return list.map((inv, i) => {
    const cited = inv.sources
      .map((s) => sources.findIndex((x) => x.uri === s.uri))
      .filter((n) => n >= 0).map((n) => `S${n + 1}`);
    const label = inv.angle.round === 2 ? `Follow-up ${i + 1}` : `Angle ${i + 1}`;
    return `### ${label}: ${inv.angle.question}\nSources behind this note: ${cited.join(", ") || "(none)"}\n${JSON.stringify(inv.data).slice(0, 5000)}`;
  }).join("\n\n");
}

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
      const { data, sources } = await geminiGroundedJSON(prompt, "agent", { userId, feature: "agent_research" }, { maxTokens: THINKING_ROOM + 4000 });
      return { result: data, sources, memoryIds: ids, grounded: true };
    } catch (e) {
      console.error("[agents] grounding unavailable, plain fallback:", e);
      const data = await geminiJSON<Record<string, unknown>>(prompt, "agent", { userId, feature: "agent_research" }, { maxTokens: THINKING_ROOM + 4000 });
      return { result: data, sources: modelSources(data), memoryIds: ids, grounded: false };
    }
  },

  /** Deep Research - plan → 6 parallel grounded investigations → gap check
   *  and targeted follow-up searches → cross-checked, cited report. */
  async deepResearch(sb: any, userId: string, query: string): Promise<AgentOutcome> {
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    const blocked = await agentSafetyGate(query, userId, "agent_deep_research");
    if (blocked) return blocked;
    const ctx = { userId, feature: "agent_deep_research" };
    const today = new Date().toISOString().slice(0, 10);
    const { block, ids } = await memoryContext(sb, userId, query, 6);

    // 1. plan
    let angles: Angle[] = [];
    try {
      const plan = await geminiJSON<{ angles?: { question?: string; why?: string }[] }>(
        `You are planning a deep research investigation. Today is ${today}.
TOPIC: "${query}"
USER CONTEXT (their own notes, may be empty):
${block}

Break the topic into 6 distinct, non-overlapping research angles that together give a
thorough, balanced picture. Cover, where they apply: fundamentals and how it works; the
strongest evidence; the current state with recent numbers; costs, trade-offs and
alternatives; criticism, risks and open debates; practical application for someone in the
user's situation. Each must be a concrete, searchable question.
Return ONLY JSON: { "angles": [ { "question": string, "why": string (max 12 words) } ] }`,
        "agent", ctx, { temperature: 0.3, maxTokens: THINKING_ROOM + 1500 },
      );
      angles = (plan.angles ?? [])
        .filter((a) => typeof a?.question === "string" && a.question.trim())
        .slice(0, 6)
        .map((a) => ({ question: a.question!.slice(0, 200), why: str(a.why, 120), round: 1 as const }));
    } catch (e) {
      console.error("[deep-research] planning failed, using default angles:", e);
    }
    if (angles.length < 3) {
      angles = [
        { question: `${query} - what is the evidence and how does it work?`, why: "Fundamentals" },
        { question: `${query} - latest data, numbers and developments`, why: "Current state" },
        { question: `${query} - costs, trade-offs and alternatives`, why: "Options" },
        { question: `${query} - criticism, risks and open debates`, why: "Counterpoints" },
        { question: `${query} - practical recommendations`, why: "Application" },
      ].map((a) => ({ ...a, round: 1 as const }));
    }

    // 2. investigate every angle in parallel
    const round1 = await Promise.allSettled(angles.map((a) => investigate(a, query, today, ctx, ANGLE_TIMEOUT_MS)));
    round1.forEach((r, i) => { if (r.status === "rejected") console.error(`[deep-research] angle failed: ${angles[i].question}`, r.reason); });
    const investigated: Investigated[] = round1
      .map((r, i) => (r.status === "fulfilled" ? { angle: angles[i], ...r.value } : null))
      .filter(Boolean) as Investigated[];

    if (investigated.length === 0) {
      console.error("[deep-research] every angle failed - falling back to single-pass research");
      const quick = await AgentService.research(sb, userId, query);
      return { ...quick, result: { ...quick.result, _degraded: true } };
    }

    // 3. gap check: what's weak, contradictory or missing -> targeted follow-ups
    let followUps: Angle[] = [];
    if (elapsed() < FOLLOW_UP_CUTOFF_MS) {
      try {
        const digest = investigated.map((inv, i) => {
          const d = inv.data as any;
          const claims = Array.isArray(d.findings) ? d.findings.map((f: any) => `- (${f?.strength ?? "?"}) ${f?.claim ?? ""}`).join("\n") : "";
          return `Angle ${i + 1}: ${inv.angle.question}\n${str(d.summary, 900)}\n${claims}\nDisagreements: ${str(d.disagreements, 300) || "none"}\nUnanswered: ${str(d.unanswered, 300) || "none"}`;
        }).join("\n\n");
        const gaps = await geminiJSON<{ follow_ups?: { question?: string; why?: string }[] }>(
          `You are reviewing the first round of a deep research investigation into: "${query}".

FIRST-ROUND RESULTS:
${digest}

Pick the 3 follow-up searches that would most improve the final report: resolve a
contradiction between angles, verify an important claim that is only "weak" or "moderate",
fill a gap the angles left unanswered, or get more recent data. Each must be a concrete,
searchable question that is NOT a repeat of a first-round angle.
Return ONLY JSON: { "follow_ups": [ { "question": string, "why": string (max 12 words) } ] }`,
          "agent", ctx, { temperature: 0.2, maxTokens: THINKING_ROOM + 1000 },
        );
        followUps = (gaps.follow_ups ?? [])
          .filter((a) => typeof a?.question === "string" && a.question.trim())
          .slice(0, 3)
          .map((a) => ({ question: a.question!.slice(0, 200), why: str(a.why, 120), round: 2 as const }));
      } catch (e) {
        console.error("[deep-research] gap check failed, writing from round one only:", e);
      }
    }
    if (followUps.length) {
      const round2 = await Promise.allSettled(followUps.map((a) => investigate(a, query, today, ctx, FOLLOW_UP_TIMEOUT_MS)));
      round2.forEach((r, i) => {
        if (r.status === "fulfilled") investigated.push({ angle: followUps[i], ...r.value });
        else console.error(`[deep-research] follow-up failed: ${followUps[i].question}`, r.reason);
      });
    }

    const sources = dedupeSources(investigated.flatMap((i) => i.sources)).slice(0, 30);
    const sourceList = sources.map((s, i) => `[S${i + 1}] ${s.title} - ${s.uri}`).join("\n") || "(no source list)";
    const notes = notesWithSources(investigated, sources);

    // 4. synthesize
    const synthesisPrompt = (full: boolean) => `You are a senior research analyst writing a deep research report for one person. Today is ${today}.

TOPIC: "${query}"

RESEARCH NOTES from ${investigated.length} independent web investigations (first-round angles,
then follow-ups that checked gaps and contradictions):
${notes}

SOURCES FOUND:
${sourceList}

THE USER'S OWN RELATED NOTES (use only to personalize, never as evidence):
${block}

Cross-check the notes against each other. Where they agree, state it confidently; where they
conflict, say so plainly and say which side the follow-ups support. Never invent statistics
that are not in the notes. Write clearly, no filler, no marketing tone.
CITATIONS: after a factual sentence, cite the sources behind the note it came from as [S1] or
[S2][S7] - only numbers listed for that note. Don't cite the user's own notes.

Return ONLY JSON:
{ "title": string (report headline, max 10 words),
  "answer": string (executive summary, 5-7 sentences - the bottom line first, with citations),
  "key_points": [ { "point": string, "icon": string (ONE emoji) } ] (5-7),
  "sections": [ { "heading": string, "icon": string (ONE emoji), "body": string (${full ? "3-4" : "2"} paragraphs separated by \\n\\n, with citations) } ] (${full ? "5-7" : "3-5"}),
  "key_numbers": [ { "label": string, "value": string, "context": string } ] (0-6),
  "timeline": [ { "date": string, "event": string } ] (0-6, only if the topic has a real chronology),
  "recommendations": [ { "action": string, "why": string, "icon": string (ONE emoji) } ] (3-5, concrete next steps for THIS user),
  "debates": [ { "question": string, "sides": string } ] (0-3, genuine open disagreements),
  "gaps": [string] (0-3, what the research could not establish or verify),
  "confidence": { "level": "high"|"medium"|"low", "reason": string },
  "surprising_fact": string|null,
  "try_this": string|null,
  "so_what": string (what this means for THIS user specifically),
  "follow_up_questions": [string] (3),
  "tags": [string] (2-5 short lowercase topic tags) }`;

    let report: Record<string, unknown>;
    try {
      report = await geminiJSON<Record<string, unknown>>(synthesisPrompt(true), "agent", ctx, { maxTokens: THINKING_ROOM + 12_000, temperature: 0.3 });
    } catch (e) {
      // a long report can come back truncated (unparseable) - a shorter one
      // usually fits, if there's still time for it
      if (aiOutageOf(e) || elapsed() > RETRY_SYNTHESIS_CUTOFF_MS) throw e;
      console.error("[deep-research] full report failed, retrying shorter:", e);
      report = await geminiJSON<Record<string, unknown>>(synthesisPrompt(false), "agent", ctx, { maxTokens: THINKING_ROOM + 6000, temperature: 0.3 });
    }

    return {
      result: {
        ...report,
        angles: investigated.map((i) => ({ question: i.angle.question, why: i.angle.why, round: i.angle.round })),
        angles_failed: angles.length + followUps.length - investigated.length,
        _duration_s: Math.round(elapsed() / 1000),
      },
      sources,
      memoryIds: ids,
      grounded: true,
    };
  },
};
