import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

export default async function Landing() {
  const user = await getUser();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-6 md:px-10 h-16 max-w-5xl mx-auto w-full">
        <span className="font-display text-xl">TimelyMemo</span>
        <Link href={user ? "/dashboard" : "/login"} className="btn-primary !py-2">
          {user ? "Open TimelyMemo" : "Sign in"}
        </Link>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 md:px-10 flex flex-col justify-center py-16">
        <h1 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl">
          Remember things<br />
          <span className="text-ember">at the right time.</span>
        </h1>
        <p className="mt-6 text-ink-2 max-w-xl text-lg leading-relaxed">
          An external memory for everyday life. Type or say anything - a purchase, a promise,
          a stray idea at midnight, a book you finished - and TimelyMemo understands it, connects it,
          and brings it back exactly when it's useful. You never organize anything.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/dashboard" : "/login"} className="btn-primary !px-6 !py-3 !text-base">Start remembering</Link>
          <Link href="/login" className="btn-ghost !px-6 !py-3 !text-base">Sign in</Link>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-16">
          {[
            { t: "Remember", d: "Every memory keeps your exact words. The AI adds structure - type, people, dates, amounts, books - around them, never over them." },
            { t: "Connect", d: "\"My back hurts when sitting\" and \"I need a better desk\" become one visible thread. Similar thoughts get flagged as recurring." },
            { t: "Notice", d: "Forgotten commitments, intentions that never became habits, recurring patterns - surfaced gently, never spammily." },
          ].map((c) => (
            <div key={c.t} className="card p-6">
              <p className="font-display text-xl text-ember">{c.t}</p>
              <p className="text-sm text-ink-2 mt-2 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 mt-8 max-w-xl">
          <p className="label mb-3">Example</p>
          <p className="text-[15px]">"I should start exercising regularly."</p>
          <p className="text-sm text-ink-2 mt-3">You've mentioned something similar before.</p>
          <ul className="text-sm text-ink-2 mt-1 space-y-0.5">
            <li>Jan 14 - "I need to exercise more."</li>
            <li>Mar 3 - "I should start going to the gym."</li>
          </ul>
          <p className="text-sm text-ink-2 mt-1.5">This seems to be a recurring intention. <span className="text-ember">Create a goal</span></p>
        </div>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-2">
        Remember. Connect. Notice. - Your memories stay yours. Never used for training.
      </footer>
    </div>
  );
}
