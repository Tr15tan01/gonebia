import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { sortedPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog - TimelyMemo",
  description: "Notes on memory, attention, and building tools that remember for you.",
};

export default function BlogPage() {
  const posts = sortedPosts();
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 md:px-10 py-14">
        <header>
          <h1 className="font-display text-4xl">Blog</h1>
          <p className="text-ink-2 mt-3 text-lg leading-relaxed">
            Notes on memory, attention, and tools that remember for you.
          </p>
        </header>

        <p className="mt-6 text-xs text-ink-2 card p-3">
          ✎ These are sample posts. To publish your own, edit <code>src/lib/blog.ts</code> - each post is a plain object, newest date shows first.
        </p>

        <div className="space-y-4 mt-8">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card p-5 soft-shadow hover:border-ember/50 transition-colors block">
              <div className="flex items-center gap-2 text-xs text-ink-2">
                <span className="chip">{p.tag}</span>
                <span>{new Date(p.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
                <span>· {p.minutes} min read</span>
              </div>
              <p className="font-display text-xl mt-3 leading-snug">{p.title}</p>
              <p className="text-sm text-ink-2 mt-2 leading-relaxed">{p.excerpt}</p>
              <p className="text-sm text-ember mt-3">Read →</p>
            </Link>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
