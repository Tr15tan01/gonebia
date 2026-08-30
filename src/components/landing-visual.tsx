/** Hero illustration: a code-drawn product mockup - a capture card with
 *  floating, type-colored memory chips. No image assets: always renders,
 *  adapts to light/dark, scales down gracefully on mobile. */

export function LandingVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md py-8" aria-hidden>
      {/* soft radial glow */}
      <div
        className="absolute inset-0 -z-10 blur-2xl opacity-60"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 45%, var(--ember-soft) 0%, transparent 70%)",
        }}
      />
      {/* decorative rings (logo motif) */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 -z-10 w-full h-full opacity-[0.14]">
        <circle cx="200" cy="200" r="150" fill="none" stroke="var(--ember)" strokeWidth="1.5" />
        <circle cx="200" cy="200" r="110" fill="none" stroke="var(--ember)" strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="330" cy="90" r="8" fill="var(--ember)" />
      </svg>

      {/* floating chips */}
      <div className="absolute -left-2 sm:-left-6 top-6 chip chip-c-task soft-shadow -rotate-6 !text-xs bg-card">
        ☑ Task - due tomorrow
      </div>
      <div className="absolute -right-2 sm:-right-8 top-1/3 chip chip-c-book soft-shadow rotate-3 !text-xs bg-card">
        📖 Finished Atomic Habits
      </div>
      <div className="absolute left-2 sm:left-0 bottom-8 chip chip-c-ask soft-shadow rotate-2 !text-xs bg-card">
        ⏰ Reminder in 30 min
      </div>
      <div className="hidden sm:block absolute -right-6 bottom-16 chip chip-c-decision soft-shadow -rotate-3 !text-xs bg-card">
        ◆ Decision - PostgreSQL
      </div>

      {/* main capture card */}
      <div className="card soft-shadow p-5 space-y-3 rotate-[-1.5deg]">
        <p className="text-[13px] text-ink-2">Tell TimelyMemo something...</p>
        <p className="text-[15px] leading-snug">I should start exercising regularly.</p>
        <div className="h-px bg-line" />
        <p className="text-sm">
          <span className="font-medium" style={{ color: "var(--ember)" }}>Got it.</span>{" "}
          This seems to be a recurring intention.
        </p>
        <ul className="text-xs text-ink-2 space-y-1">
          <li>Jan 14 - "I need to exercise more."</li>
          <li>Mar 3 - "I should start going to the gym."</li>
          <li>Jun 18 - "I need to get back into training."</li>
        </ul>
        <div className="flex gap-1.5 pt-1">
          <span className="chip chip-c-goal !text-[11px]">goal</span>
          <span className="chip !text-[11px]">3 similar memories</span>
        </div>
      </div>

      {/* reply bubble */}
      <div className="card soft-shadow p-3.5 mt-4 ml-auto w-4/5 rotate-[1deg]">
        <p className="text-xs text-ink-2">2 months later, 9:00 AM</p>
        <p className="text-sm mt-1">
          <span style={{ color: "var(--danger)" }} className="font-medium">🔔</span>{" "}
          You've mentioned this 3 times. Still on your mind?
        </p>
      </div>
    </div>
  );
}
