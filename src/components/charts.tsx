const TYPE_COLOR: Record<string, string> = {
  task: "var(--c-task)", promise: "var(--c-promise)", commitment: "var(--c-promise)",
  book: "var(--c-book)", purchase: "var(--c-buy)", expense: "var(--c-buy)",
  decision: "var(--c-decision)", idea: "var(--c-idea)", goal: "var(--c-goal)",
  habit: "var(--c-goal)", event: "var(--c-event)", person: "var(--c-person)",
  question: "var(--c-ask)", knowledge: "var(--c-know)", place: "var(--c-place)",
  project: "var(--c-know)", reflection: "var(--c-know)", observation: "var(--c-event)",
  reminder: "var(--c-ask)", thought: "var(--ink-2)",
};

export interface ActivityDay { label: string; count: number }
export interface TypeCount { type: string; count: number }

/** 30-day capture activity - one bar per day, ember colored. */
export function ActivityChart({ days }: { days: ActivityDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  return (
    <div>
      <p className="text-sm text-ink-2 mb-2">
        <span className="font-display text-xl font-semibold" style={{ color: "var(--ember)" }}>{total}</span>
        {" "}memories captured in the last {days.length} days
      </p>
      <div className="flex items-end gap-[2px] h-20">
        {days.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group" title={`${d.label}: ${d.count}`}>
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / max) * 100)}%`,
                background: d.count > 0
                  ? "var(--ember)"
                  : "color-mix(in srgb, var(--ink-2) 18%, transparent)",
                opacity: d.count > 0 ? 0.55 + 0.45 * (d.count / max) : 1,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-ink-2 mt-1">
        <span>{days[0]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Memory types - horizontal colored bars, same palette as the chips. */
export function TypeBreakdown({ types }: { types: TypeCount[] }) {
  const max = Math.max(1, ...types.map((t) => t.count));
  return (
    <div className="space-y-2">
      {types.map((t) => (
        <div key={t.type} className="flex items-center gap-2.5 text-sm">
          <span className="w-24 shrink-0 text-ink-2 capitalize">{t.type}</span>
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--ink-2) 12%, transparent)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (t.count / max) * 100)}%`,
                background: TYPE_COLOR[t.type] ?? "var(--ink-2)",
              }}
            />
          </div>
          <span className="w-8 text-right font-medium" style={{ color: TYPE_COLOR[t.type] ?? "var(--ink-2)" }}>
            {t.count}
          </span>
        </div>
      ))}
    </div>
  );
}
