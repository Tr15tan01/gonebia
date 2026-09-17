/** One source of truth for how each memory type looks across the app:
 *  chips, bars, graph nodes and legends all read from here. */
export const TYPE_COLOR: Record<string, string> = {
  task: "var(--c-task)", promise: "var(--c-promise)", commitment: "var(--c-promise)",
  book: "var(--c-book)", purchase: "var(--c-buy)", expense: "var(--c-buy)",
  decision: "var(--c-decision)", idea: "var(--c-idea)", goal: "var(--c-goal)",
  habit: "var(--c-goal)", event: "var(--c-event)", person: "var(--c-person)",
  question: "var(--c-ask)", knowledge: "var(--c-know)", place: "var(--c-place)",
  project: "var(--c-know)", reflection: "var(--c-know)", observation: "var(--c-event)",
  reminder: "var(--c-ask)", movie: "var(--c-movie)", sleep: "var(--c-sleep)",
  thought: "var(--ink-2)",
};

export const TYPE_CHIP: Record<string, string> = {
  task: "chip-c-task", book: "chip-c-book", purchase: "chip-c-buy", expense: "chip-c-buy",
  decision: "chip-c-decision", idea: "chip-c-idea", goal: "chip-c-goal", event: "chip-c-event",
  person: "chip-c-person", promise: "chip-c-promise", commitment: "chip-c-promise",
  question: "chip-c-ask", knowledge: "chip-c-know", place: "chip-c-place",
  project: "chip-c-know", habit: "chip-c-goal", reflection: "chip-c-know",
  observation: "chip-c-event", reminder: "chip-c-ask", movie: "chip-c-movie",
  sleep: "chip-c-sleep", thought: "",
};

export const TYPE_ICON: Record<string, string> = {
  task: "☑️", promise: "🤝", commitment: "🤝", book: "📚", purchase: "🛍️", expense: "💸",
  decision: "⚖️", idea: "💡", goal: "🎯", habit: "🔁", event: "📅", person: "👤",
  question: "❓", knowledge: "🧠", place: "📍", project: "🧩", reflection: "🪞",
  observation: "👁️", reminder: "⏰", movie: "🎬", sleep: "😴", thought: "💭",
};

export const typeColor = (t: string | null | undefined) => TYPE_COLOR[t ?? ""] ?? "var(--ink-2)";
export const typeChip = (t: string | null | undefined) => TYPE_CHIP[t ?? ""] ?? "";
export const typeIcon = (t: string | null | undefined) => TYPE_ICON[t ?? ""] ?? "💭";
