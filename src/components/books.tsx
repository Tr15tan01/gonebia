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
  topic?: string | null;
  pub_year?: number | null;
  description?: string | null;
  cover_url?: string | null;
  isbn?: string | null;
  enrich_status?: string;
  notes_list?: { id: string; title: string; text: string; created_at: string }[];
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
  const [retrying, setRetrying] = useState<string | null>(null);
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

  async function replaceBook(book: BookRow) {
    setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, ...book } : b)));
  }

  async function relookup(id: string) {
    setRetrying(id);
    const res = await fetch("/api/books/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await res.json().catch(() => ({}));
    setRetrying(null);
    if (d.book) {
      replaceBook(d.book);
      if (d.ok) toast("Found it online - details added.");
      else toast("Still not in the book databases - your entry stays as you wrote it.");
    } else toast("Lookup failed - please try again.");
  }

  const reading = books.filter((b) => b.status === "reading");
  const nextUp = books.filter((b) => b.status === "want_to_read");
  const finished = books.filter((b) => b.status === "finished");
  const abandoned = books.filter((b) => b.status === "abandoned");

  return (
    <div className="space-y-8">
      <Link
        href={`/dashboard?prefill=${encodeURIComponent("I finished reading ")}`}
        className="btn-ghost !py-1.5 !text-xs w-fit"
      >
        + Add a book (just tell TimelyMemo about it)
      </Link>

      {books.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-3">📖</div>
          <p className="font-medium">Your shelf is empty.</p>
          <p className="text-sm text-ink-2 mt-1">
            Say something like "I'm reading Sapiens by Harari" and it will appear here -
            with cover, topic and details looked up online.
          </p>
        </div>
      )}

      {reading.length > 0 && (
        <Section title="📖 Reading now" count={reading.length}>
          {reading.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory}
              onRelookup={relookup} retrying={retrying === b.id} />
          ))}
        </Section>
      )}

      {nextUp.length > 0 && (
        <Section title="🔖 Up next" count={nextUp.length}>
          {nextUp.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory}
              onRelookup={relookup} retrying={retrying === b.id} />
          ))}
        </Section>
      )}

      {finished.length > 0 && (
        <Section title="📗 Finished" count={finished.length}>
          {finished.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory}
              onRelookup={relookup} retrying={retrying === b.id} />
          ))}
        </Section>
      )}

      {abandoned.length > 0 && (
        <Section title="⏸ Paused / not finished" count={abandoned.length}>
          {abandoned.map((b) => (
            <BookCard key={b.id} book={b} onPatch={patch} onOpenMemory={setOpenMemory}
              onRelookup={relookup} retrying={retrying === b.id} />
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

function NotesList({ notes, onOpenMemory }: {
  notes: { id: string; title: string; text: string; created_at: string }[];
  onOpenMemory: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button onClick={() => setOpen((o) => !o)} className="text-ember hover:underline cursor-pointer">
        {open ? "hide" : `${notes.length} note${notes.length === 1 ? "" : "s"} about this book`} {open ? "↑" : "↓"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => onOpenMemory(n.id)}
                className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-paper-2 cursor-pointer"
              >
                <span className="text-ink-2">{fmtDate(n.created_at)} · </span>
                {n.title || n.text.slice(0, 80)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cover({ book }: { book: BookRow }) {
  if (book.cover_url) {
    return (
      <img
        src={book.cover_url}
        alt=""
        referrerPolicy="no-referrer"
        className="w-14 h-20 rounded-lg object-cover shrink-0 bg-paper-2"
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
      />
    );
  }
  return (
    <div className="w-14 h-20 rounded-lg shrink-0 grid place-items-center text-xl"
      style={{ background: "color-mix(in srgb, var(--c-book) 12%, transparent)", color: "var(--c-book)" }}
      aria-hidden>▤</div>
  );
}

function BookCard({ book, onPatch, onOpenMemory, onRelookup, retrying }: {
  book: BookRow;
  onPatch: (id: string, p: Partial<BookRow>) => void;
  onOpenMemory: (id: string) => void;
  onRelookup: (id: string) => void;
  retrying: boolean;
}) {
  return (
    <div className="card p-4 soft-shadow">
      <div className="flex gap-3">
        <Cover book={book} />
        <div className="min-w-0 flex-1 space-y-2">
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
            {book.recommended_by && <span className="chip chip-c-person">recommended by {book.recommended_by}</span>}
          </div>

          {(book.notes_list?.length ?? 0) > 0 && (
            <NotesList notes={book.notes_list!} onOpenMemory={onOpenMemory} />
          )}

          {book.topic && <div className="flex flex-wrap gap-1.5">
            {book.topic.split(",").map((t) => <span key={t} className="chip chip-c-know !text-[11px]">{t.trim()}</span>)}
            {book.pub_year ? <span className="chip !text-[11px]">{book.pub_year}</span> : null}
          </div>}

          {book.description && (
            <p className="text-xs text-ink-2 leading-relaxed" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {book.description}
            </p>
          )}

          {book.enrich_status === "not_found" && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-2">Not found in book databases - kept from your words.</span>
              <button onClick={() => onRelookup(book.id)} disabled={retrying} className="btn-ghost !py-1 !px-2 !text-[11px] cursor-pointer">
                {retrying ? "Looking..." : "Look up online"}
              </button>
            </div>
          )}
          {(!book.enrich_status || book.enrich_status === "none") && (
            <div className="text-xs">
              <button onClick={() => onRelookup(book.id)} disabled={retrying} className="btn-ghost !py-1 !px-2 !text-[11px] cursor-pointer">
                {retrying ? "Looking..." : "Look up online"}
              </button>
            </div>
          )}

          {book.notes && <p className="text-sm text-ink-2">{book.notes}</p>}
        </div>
      </div>
    </div>
  );
}
