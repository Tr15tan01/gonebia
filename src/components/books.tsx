"use client";
import { useState } from "react";
import Link from "next/link";
import { MemorySheet } from "@/components/memory";
import { useToast } from "@/components/ui";
import { fmtDate } from "@/lib/dates";

export interface BookRow {
  id: string;
  memory_id: string | null;
  title: string;
  author: string | null;
  status: string;
  rating: number | null;
  notes: string | null;
  recommended_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

const STATUSES = ["want_to_read", "reading", "finished", "abandoned"] as const;
const STATUS_LABEL: Record<string, string> = {
  want_to_read: "want to read",
  reading: "reading",
  finished: "finished",
  abandoned: "paused",
};

export function BooksClient({ initial }: { initial: BookRow[] }) {
  const [books, setBooks] = useState<BookRow[]>(initial);
  const [openMemory, setOpenMemory] = useState<string | null>(null);
  const toast = useToast();

  async function patch(id: string, p: Partial<BookRow>) {
    setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b))); // optimistic
    const res = await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...p }),
    });
    if (!res.ok) toast("Couldn't save that change.");
  }

  const reading = books.filter((b) => b.status === "reading");
  const nextUp = books.filter((b) => b.status === "want_to_read");
  const done = books.filter((b) => b.status === "finished" || b.status === "abandoned");

  return (
    <div className="space-y-8">
      <Link
        href={`/dashboard?prefill=${encodeURIComponent("I finished reading ")}`}
        className="btn-ghost !py-1.5 !text-xs w-fit"
      >
        + Add a book (just tell Gonebia about it)
      </Link>

      {books.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-3">📖</div>
          <p className="font-medium">Your shelf is empty.</p>
          <p className="text-sm text-ink-2 mt-1">
            Say something like "I'm reading Sapiens by Harari" and it will appear here.
          </p>
        </div>
      )}

      {reading.length > 0 && (
        <Section title="Reading now" count={reading.length}>
          {reading.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory} />
          ))}
        </Section>
      )}

      {nextUp.length > 0 && (
        <Section title="Up next" count={nextUp.length}>
          {nextUp.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory} />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="Finished & paused" count={done.length}>
          {done.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory} />
          ))}
        </Section>
      )}

      <MemorySheet id={openMemory} onClose={() => setOpenMemory(null)} />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="label mb-2.5">{title} <span className="normal-case">({count})</span></h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Stars({ value, onSet }: { value: number | null; onSet: (n: number | null) => void }) {
  return (
    <div className="flex gap-0.5" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onSet(value === n ? null : n)} aria-label={`Rate ${n} of 5`} className="cursor-pointer">
          <span className={value && n <= value ? "text-ember" : "text-ink-2/30"}>★</span>
        </button>
      ))}
    </div>
  );
}

function BookCard({ book, onPatch, onOpenMemory }: {
  book: BookRow;
  onPatch: (id: string, p: Partial<BookRow>) => void;
  onOpenMemory: (id: string) => void;
}) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg leading-snug">{book.title}</p>
          {book.author && <p className="text-sm text-ink-2">{book.author}</p>}
        </div>
        <select
          value={book.status}
          onChange={(e) => onPatch(book.id, { status: e.target.value })}
          className="input !py-1 !px-2 !text-xs w-auto shrink-0"
          aria-label="Status"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2">
        <Stars value={book.rating} onSet={(n) => onPatch(book.id, { rating: n })} />
        {book.finished_at && <span>finished {fmtDate(book.finished_at)}</span>}
        {book.started_at && !book.finished_at && <span>started {fmtDate(book.started_at)}</span>}
        {book.recommended_by && <span className="chip">recommended by {book.recommended_by}</span>}
        {book.memory_id && (
          <button onClick={() => onOpenMemory(book.memory_id!)} className="text-ember hover:underline">
            memories →
          </button>
        )}
      </div>

      {book.notes && <p className="text-sm text-ink-2">{book.notes}</p>}
    </div>
  );
}
