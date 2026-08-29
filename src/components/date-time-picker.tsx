"use client";
import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Mo","Tu","We","Th","Fr","Sa","Su"];

/** Clickable calendar + time selects. Value format: "YYYY-MM-DDTHH:mm" (local). */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : null;
  const [month, setMonth] = useState(() => {
    const s = selected ?? new Date();
    return new Date(s.getFullYear(), s.getMonth(), 1);
  });

  // when the popover opens, center it on the selected (or current) month
  useEffect(() => {
    if (open) {
      const s = selected ?? new Date();
      setMonth(new Date(s.getFullYear(), s.getMonth(), 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function emit(d: Date) {
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  function pickDay(day: number) {
    const base = selected ?? new Date();
    emit(new Date(month.getFullYear(), month.getMonth(), day, base.getHours(), base.getMinutes()));
  }
  function setTime(h: number, m: number) {
    const base = selected ?? new Date(month.getFullYear(), month.getMonth(), 15);
    emit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m));
  }

  const y = month.getFullYear(), m = month.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const now = new Date();
  const sameDay = (d: Date, day: number) =>
    d.getFullYear() === y && d.getMonth() === m && d.getDate() === day;

  const hour = selected ? selected.getHours() : 12;
  const minute = selected ? selected.getMinutes() : 0;

  const label = selected
    ? selected.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "When";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`chip cursor-pointer !py-1.5 ${value ? "!border-ember !text-ember" : ""}`}
        aria-label="Choose date and time"
        aria-expanded={open}
      >
        📅 {label}
      </button>

      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}

      {open && (
        <div className="absolute z-20 mt-2 w-72 card p-3 shadow-lg rise">
          {/* month header */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setMonth(new Date(y, m - 1, 1))} className="btn-ghost !px-2 !py-1" aria-label="Previous month">‹</button>
            <span className="text-sm font-medium">{MONTHS[m]} {y}</span>
            <button onClick={() => setMonth(new Date(y, m + 1, 1))} className="btn-ghost !px-2 !py-1" aria-label="Next month">›</button>
          </div>

          {/* weekday header */}
          <div className="grid grid-cols-7 text-center text-[10px] text-ink-2 mb-1">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>

          {/* day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <span key={i} />;
              const isSel = !!selected && sameDay(selected, day);
              const isToday = sameDay(now, day);
              return (
                <button
                  key={i}
                  onClick={() => pickDay(day)}
                  className={`h-8 rounded-lg text-sm transition-colors cursor-pointer
                    ${isSel ? "bg-ember text-white font-medium"
                      : isToday ? "border border-ember/50 text-ember hover:bg-ember-soft"
                      : "hover:bg-paper-2"}`}
                  aria-label={`${MONTHS[m]} ${day}`}
                  aria-pressed={isSel}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* time selects */}
          <div className="flex items-center gap-2 mt-3 text-sm">
            <span className="text-ink-2 text-xs">Time</span>
            <select
              className="input !py-1.5 !text-xs w-auto flex-1"
              value={hour}
              onChange={(e) => setTime(+e.target.value, minute)}
              aria-label="Hour"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{pad(h)}:00 – {pad(h)}:59</option>
              ))}
            </select>
            <select
              className="input !py-1.5 !text-xs w-auto"
              value={minute}
              onChange={(e) => setTime(hour, +e.target.value)}
              aria-label="Minutes"
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((mm) => (
                <option key={mm} value={mm}>:{pad(mm)}</option>
              ))}
            </select>
          </div>

          {/* footer actions */}
          <div className="flex justify-between mt-3">
            <button
              onClick={() => { emit(new Date()); setOpen(false); }}
              className="btn-ghost !py-1.5 !text-xs"
            >Now</button>
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className="btn-ghost !py-1.5 !text-xs"
            >Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
