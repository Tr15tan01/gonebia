export interface Post {
  slug: string;
  title: string;
  date: string;      // ISO date
  minutes: number;
  tag: string;
  excerpt: string;
  body: string[];    // one string per paragraph
}

/**
 * SAMPLE POSTS - replace with your own.
 * To publish a post: add an object to this array. The newest post (by date)
 * appears first. No database, no CMS - this file is the blog.
 */
export const posts: Post[] = [
  {
    slug: "why-we-built-timelymemo",
    title: "Why we built TimelyMemo",
    date: "2026-01-12",
    minutes: 4,
    tag: "Product",
    excerpt: "Notes apps ask you to organize. Calendars ask you to plan. TimelyMemo asks neither - it just remembers, and speaks up at the right time.",
    body: [
      "Every productivity tool we've ever used made the same quiet demand: structure things our way. Folders, boards, tags, databases. The moment you stop maintaining the structure, the tool becomes a junk drawer - and a guilt-inducing one.",
      "TimelyMemo started from the opposite premise: you should never organize anything. You say things the way you'd say them to a friend - 'I bought a computer from Alta for 2300 GEL', 'my wife asked me to fix the cabinet' - and the system does the structuring: type, people, dates, amounts, connections.",
      "The second premise is in the name. A memory that only stores is a archive; a memory that reminds is a partner. 'Remember things at the right time' isn't a slogan we picked - it's the whole product. A task you wrote three weeks ago should resurface the morning it matters, not when you happen to scroll past it.",
      "This is a sample post - replace it with your own writing in src/lib/blog.ts.",
    ],
  },
  {
    slug: "the-30-second-habit",
    title: "The 30-second habit: capturing without friction",
    date: "2026-01-05",
    minutes: 3,
    tag: "Habits",
    excerpt: "The best capture system is the one you actually use. Why speed and zero-structure beats careful organization every time.",
    body: [
      "Ask people why they abandoned a notes app and the answer is almost never 'it lacked features'. It's some version of: opening it felt like work. Deciding where a note goes, what to title it, which tag to use - that's friction, and friction kills capture.",
      "The fix is to make capturing feel like talking. One box, one sentence, done. No title required, no folder choice, no formatting. If capturing takes more than thirty seconds, the thought will often be gone before the note is saved.",
      "Structure can be added later - by you, correcting a detail, or by the system, classifying automatically. The order matters: capture first, organize never (or almost never).",
      "This is a sample post - replace it with your own writing in src/lib/blog.ts.",
    ],
  },
  {
    slug: "from-scattered-notes-to-second-brain",
    title: "From scattered notes to a second brain",
    date: "2025-12-20",
    minutes: 5,
    tag: "Ideas",
    excerpt: "A pile of notes isn't a memory. What turns fragments into something that thinks with you: connections, patterns, and honest reminders.",
    body: [
      "Most people's notes are a graveyard of good intentions: a recommendation here, a half-idea there, a shopping list from two phones ago. The information is 'saved' - and completely inert.",
      "What makes a second brain different from a pile is relation. 'My back hurts when I sit' and 'I need a better desk' are two forgettable notes; connected, they're one insight about your workspace. 'I should exercise more', said four times across six months, isn't four notes - it's a pattern you deserve to see honestly.",
      "That's the quiet ambition here: not more storage, but noticed patterns. An external memory should occasionally surprise you with your own thinking - and stay humble enough to show you the exact memories behind every claim.",
      "This is a sample post - replace it with your own writing in src/lib/blog.ts.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function sortedPosts(): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}
