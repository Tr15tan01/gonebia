#!/usr/bin/env python3
"""TimelyMemo - clear the 6 TypeScript build errors from the upgrade round.
Run from the PROJECT ROOT:  python part47_tsfixes.py"""

PATCHES = [
    # 1. watch route: dead === 0 check is type-invalid now that Free allows 3
    ("src/app/api/agents/watch/route.ts",
     "  if (lim.priceWatches === 0) {",
     "  if ((lim.priceWatches as number) === 0) {"),
    #    ...and its message described the wrong situation anyway
    ("src/app/api/agents/watch/route.ts",
     '      error: "You\'re already tracking 3 products on the Free plan - stop one to add another. Pro tracks 10 with daily checks and deal alerts.",',
     '      error: "Price tracking is disabled for this plan.",'),
    #    ...and the cap message below should name the actual plan
    ("src/app/api/agents/watch/route.ts",
     'return NextResponse.json({ error: `You\'re already tracking ${lim.priceWatches} products (Pro limit). Stop one first.` }, { status: 402 });',
     'return NextResponse.json({ error: `You\'re already tracking ${lim.priceWatches} products on the ${plan === "free" ? "Free" : "Pro"} plan - stop one to add another.` }, { status: 402 });'),

    # 2. agents.ts: type the three plain geminiJSON calls (research/buying fallbacks + solver)
    ("src/lib/services/agents.ts",
     "const data = await geminiJSON(prompt);",
     "const data = await geminiJSON<Record<string, unknown>>(prompt);"),

    # 3. discover.ts: type the radar callback param(s)
    ("src/lib/services/discover.ts",
     "((e) =>",
     "((e: any) =>"),

    # 4. insights.ts: embed comes back typed as an array - cast the loop (restores part-8 fix)
    ("src/lib/services/insights.ts",
     "      for (const m of open ?? []) {",
     "      for (const m of (open ?? []) as any[]) {"),
]

for path, old, new in PATCHES:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
    except FileNotFoundError:
        print(f"  MISSING           {path}")
        continue
    if new in text:
        print(f"  already patched   {path}")
        continue
    n = text.count(old)
    if n >= 1:
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text.replace(old, new))
        print(f"  patched ({n}x)     {path}")
    else:
        print(f"  !! MISMATCH       {path} - paste the file and I'll adapt")

print("\n  npm run build")
print('  git add -A && git commit -m "Fix 6 TypeScript errors from upgrade round" && git push')