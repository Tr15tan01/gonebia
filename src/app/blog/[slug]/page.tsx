import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { getPost, sortedPosts } from "@/lib/blog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  return { title: post ? `${post.title} - TimelyMemo` : "Post - TimelyMemo" };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const others = sortedPosts().filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 md:px-10 py-14">
        <Link href="/blog" className="text-sm text-ember">← All posts</Link>

        <header className="mt-6">
          <div className="flex items-center gap-2 text-xs text-ink-2">
            <span className="chip">{post.tag}</span>
            <span>{new Date(post.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
            <span>· {post.minutes} min read</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl mt-4 leading-tight">{post.title}</h1>
        </header>

        <div className="mt-8 space-y-5">
          {post.body.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-ink-2">{p}</p>
          ))}
        </div>

        {others.length > 0 && (
          <div className="mt-14 pt-8 border-t border-line">
            <p className="label mb-3">Keep reading</p>
            <div className="space-y-3">
              {others.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="card p-4 hover:border-ember/50 transition-colors block">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-ink-2 mt-1">{p.excerpt.slice(0, 90)}...</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
