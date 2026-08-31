#!/usr/bin/env python3
"""TimelyMemo - fix the last implicit-any at discover.ts:137 by locating the
actual callback text. Run from the PROJECT ROOT:  python part48_lastfix.py"""

import re

p = "src/lib/services/discover.ts"
with open(p, "r", encoding="utf-8") as fh:
    lines = fh.readlines()

idx = 136  # 0-based for line 137
line = lines[idx]
print("  BEFORE:", line.rstrip())

# Show the whole radar block for context if the line doesn't look like a callback
if "(e)" not in line and "=>" not in line:
    print("\n  !! Line 137 is not a callback line - context around it:")
    for i in range(max(0, idx - 4), min(len(lines), idx + 3)):
        print(f"  {i+1:4d}: {lines[i].rstrip()}")
    print("\n  Paste this output and I'll write the exact patch.")
    raise SystemExit(1)

# Add explicit any to the first untyped single-letter param on this line
new = re.sub(r"\(((?:\w+))\)", r"(\1: any)", line, count=1)
if new == line:
    new = re.sub(r"\b(e)\b(?=\s*=>)", r"\1: any", line, count=1)
if new == line:
    print("  !! Could not transform the line automatically - paste it and I'll adapt")
    raise SystemExit(1)

lines[idx] = new
with open(p, "w", encoding="utf-8", newline="\n") as fh:
    fh.writelines(lines)
print("  AFTER: ", new.rstrip())
print("\n  npm run build")
print('  git add -A && git commit -m "Fix implicit any in discover radar" && git push')