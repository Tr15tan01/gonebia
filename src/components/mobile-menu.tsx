"use client";
import { useState } from "react";
import Link from "next/link";

/** Hamburger menu for public pages on small screens (desktop keeps inline nav). */
export function MobileMenu({ cta }: { cta?: string }) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/#examples", label: "Examples" },
    { href: "/why", label: "Why it matters" },
    { href: "/blog", label: "Blog" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ];
  return (
    <div className="sm:hidden relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost !px-2.5 cursor-pointer"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 top-16 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-40 card p-3 w-52 rise soft-shadow">
            <nav className="flex flex-col text-sm">
              {links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                  className="py-2 px-2 rounded-lg text-ink-2 hover:text-ember hover:bg-paper-2 cursor-pointer">
                  {l.label}
                </Link>
              ))}
              <Link href={cta ?? "/login"} onClick={() => setOpen(false)} className="btn-primary mt-2">
                {cta ?? "Sign in"}
              </Link>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
