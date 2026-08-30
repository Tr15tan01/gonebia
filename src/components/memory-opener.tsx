"use client";
import { useState } from "react";
import { MemorySheet } from "./memory";

/** Makes server-rendered content open the memory sheet on click.
 *  Usage: <MemoryOpener id={m.id}><div className="card">...</div></MemoryOpener> */
export function MemoryOpener({ id, children, className = "" }: {
  id: string; children: React.ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter") setOpen(true); }}
        className={`cursor-pointer ${className}`}
        aria-label="Open memory"
      >
        {children}
      </div>
      <MemorySheet id={open ? id : null} onClose={() => setOpen(false)} />
    </>
  );
}
