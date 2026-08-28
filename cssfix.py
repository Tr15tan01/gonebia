#!/usr/bin/env python3
"""Gonebia hotfix - Tailwind v4 compatible globals.css.
Run from the same folder as the other parts:  python part6_cssfix.py"""

import os

FILES = {}

FILES["gonebia/src/app/globals.css"] = r'''
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --paper: #faf7f2; --paper-2: #f3eee5; --card: #ffffff;
  --ink: #1c1917; --ink-2: #6b6257; --line: #e6dfd2;
  --ember: #b45309; --ember-soft: #fdf0e0;
}
.dark {
  --paper: #14110e; --paper-2: #1b1713; --card: #1e1a15;
  --ink: #ece7de; --ink-2: #a39a8c; --line: #2e2820;
  --ember: #e8963f; --ember-soft: #2a2013;
}

@theme inline {
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --color-paper: var(--paper);
  --color-paper-2: var(--paper-2);
  --color-card: var(--card);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-line: var(--line);
  --color-ember: var(--ember);
  --color-ember-soft: var(--ember-soft);
}

body { background: var(--paper); color: var(--ink); }

/* Component classes are written in plain CSS with the theme variables.
   In Tailwind v4, @apply may only reference registered utilities -
   so no custom class is ever @apply-ed here. Utilities used in JSX
   (e.g. !py-1.5) still win because the utilities layer comes last. */
@layer components {
  .card {
    border-radius: 1rem;
    border: 1px solid var(--line);
    background: var(--card);
  }

  .btn, .btn-primary, .btn-ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 0.75rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    transition: color .15s ease, background-color .15s ease,
                border-color .15s ease, opacity .15s ease;
    cursor: pointer;
  }
  .btn:disabled, .btn-primary:disabled, .btn-ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary { background: var(--ember); color: #ffffff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-ghost { border: 1px solid var(--line); color: var(--ink); }
  .btn-ghost:hover { background: var(--paper-2); }

  .input {
    width: 100%;
    border-radius: 0.75rem;
    border: 1px solid var(--line);
    background: var(--card);
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
    color: var(--ink);
    outline: none;
    transition: border-color .15s ease;
  }
  .input:focus { border-color: var(--ember); }
  .input::placeholder { color: color-mix(in srgb, var(--ink-2) 60%, transparent); }

  .chip {
    display: inline-flex;
    align-items: center;
    border-radius: 9999px;
    border: 1px solid var(--line);
    padding: 0.125rem 0.625rem;
    font-size: 0.75rem;
    color: var(--ink-2);
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-2);
  }
}

@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.rise { animation: rise .35s ease both; }
'''

def main():
    for path, content in FILES.items():
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(content.lstrip("\n"))
        print(f"  rewrote {path}")
    print("\nDone. The dev server should hot-reload - just refresh the browser.")
    print("(If it doesn't, stop with Ctrl+C and run npm run dev again.)")

if __name__ == "__main__":
    main()