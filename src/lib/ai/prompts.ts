import { MEMORY_TYPES } from "../types";

export function extractionPrompt(text: string, now: Date, tz: string, pickedAt?: string | null): string {
  return `You are the memory extraction engine for Gonebia, a personal memory assistant.
Extract structured data from the user's note.

CURRENT DATE/TIME: ${now.toISOString()}
USER TIMEZONE: ${tz} (resolve all relative dates in this timezone)
 ${pickedAt ? `\nUSER-PICKED DATE/TIME: ${pickedAt}
The user explicitly attached this date/time to the note. Use it:
- as occurred_at if the note describes something that happened,
- as due_at if it is a task/deadline,
- as reminder_at only if they asked to be reminded.
If none of those apply, still prefer this time over "now".` : ""}

USER'S NOTE:
"""${text}"""

Return ONLY a JSON object with these exact fields:
- type: one of [${MEMORY_TYPES.join(", ")}]. Choose the single best fit.
  BOOK RULE (very important): if the note mentions any BOOK - reading one, finishing one,
  wanting to read one, or a book recommendation - type MUST be "book" and the book field
  MUST be filled. Examples:
    "I read Atomic Habits by James Clear" => type "book", book {"title":"Atomic Habits","author":"James Clear","status":"finished"}
    "I'm reading Sapiens"                 => type "book", book {"title":"Sapiens","status":"reading"}
    "I want to read Deep Work"            => type "book", book {"title":"Deep Work","status":"want_to_read"}
    "Giorgi recommended a psychology book"=> type "book", book {"status":"want_to_read","recommended_by":"Giorgi"} (and people ["Giorgi"])
  TASK RULE (important): if someone asked or assigned the user to do something
  ("my wife asked me to clean the stove", "my boss wants the report by Friday"),
  type MUST be "task", with that person in people. Reserve "promise"/"commitment"
  for things the user volunteered to someone ("I promised Giorgi to review his code").
  Other guidance: "purchase"/"expense" for bought/spent, "task" for to-dos,
  "decision" for choices with reasons, "promise"/"commitment" when the user committed
  to someone, "goal" for aspirations.
- title: short label, max 8 words
- summary: one sentence
- people: person names mentioned. NEVER put a book's author here - authors go in book.author only.
- places, objects, products, companies: arrays of strings (empty if none)
- amounts: [{value: number, currency: string (ISO code, e.g. GEL/USD), label}] (empty if none)
- category: 1-2 words, e.g. "shopping", "health", "work", "home", "learning", "reading"
- importance: 1 (trivial) to 5 (life-important)
- status: "open" if actionable/unresolved, "done" if completed, "archived" otherwise
- sentiment: "positive"|"negative"|"neutral" or null if not useful
- confidence: 0-1 how certain you are
- is_decision: true if the user made a choice between options
- decision_reason: why they chose it, or null
- alternatives: options they rejected, or []
- book: fill whenever the note is about a book (see BOOK RULE):
  {"title","author" or null,"status":"want_to_read"|"reading"|"finished"|"abandoned","rating" 1-5 or null,"recommended_by" or null}
  If the note is not about a book: book = null.
- occurred_at: ISO 8601 when the event happened (past events). Resolve "yesterday",
  "last week", "two years ago" against CURRENT DATE/TIME. null if no past event.
- due_at: ISO 8601 deadline. Resolve "tomorrow", "next Friday", "in three months". null if none.
- reminder_at: ISO 8601 ONLY if the user explicitly asks to be reminded. null otherwise.
- review_at: ISO 8601 ONLY for phrases like "show me this in one year". null otherwise.
- interpretation: ONE short natural confirmation sentence, e.g.
  "Got it - you finished reading Atomic Habits by James Clear."

Rules: never invent facts not in the note; if unsure about a field use null/empty;
dates must be absolute ISO 8601 with timezone offset for ${tz}.`;
}

export function searchPlanPrompt(question: string, now: Date, tz: string): string {
  return `You plan searches over a personal memory database for the question below.

CURRENT DATE/TIME: ${now.toISOString()} (timezone ${tz})

QUESTION: """${question}"""

Return ONLY JSON:
{
  "query": "short keyword query for full-text search (2-5 words, empty if pure semantic)",
  "semantic": true,
  "types": ["task"] or null,
  "person": "person name" or null,
  "from": "ISO date" or null,
  "to": "ISO date" or null
}
Relevant memory types: thought, idea, task, event, purchase, expense, knowledge, book, question,
decision, promise, commitment, goal, habit, person, place, project, observation, reflection, reminder.
Resolve relative time ranges against CURRENT DATE/TIME (e.g. "last month" => from = first day of previous month).`;
}

export function groundedAnswerPrompt(question: string, context: string): string {
  return `You are Gonebia, answering questions about the user's own memories.
Use ONLY the memories provided below. Never invent personal information.

MEMORIES (each starts with a reference number):
 ${context}

QUESTION: """${question}"""

Rules:
- Answer in second person ("You bought...", "You read...") in a warm, concise tone.
- Cite memories inline with their reference numbers, e.g. [1] or [2][3].
- If the memories do not contain enough evidence to answer, say so explicitly and
  suggest the user tell you about it. Do not guess.
- If memories conflict, mention both with citations.

Write the answer now.`;
}

export function clusterNamePrompt(titles: string[]): string {
  return `These are titles of related personal memories:
 ${titles.map((t) => `- ${t}`).join("\n")}

Reply with ONLY a 2-5 word label naming the common theme (e.g. "Improving home office").`;
}

export function weeklyPrompt(stats: string): string {
  return `You write a warm, non-judgmental weekly reflection for a personal memory app.
Given these raw statistics from the user's week, write a JSON object:
{ "headline": "one sentence summary",
  "themes": ["2-4 main themes"],
  "observations": ["2-4 gentle, factual observations - never judgmental"] }
STATISTICS:
 ${stats}`;
}
