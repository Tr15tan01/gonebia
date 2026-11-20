import type { NextAuthConfig } from "next-auth";

/** Deliberately has NO providers and no imports of bcryptjs/Supabase - this
 *  is the config middleware uses (which runs on the Edge runtime), so it
 *  only needs to read/verify the session JWT, never hash a password or hit
 *  the database. The real Credentials provider (which needs both) lives in
 *  auth.ts, which is only ever imported by Node.js API routes/server
 *  components, never by middleware. */
export const authConfig = {
  // Must live here, not only in auth.ts: middleware builds its own NextAuth
  // from this config. Without it, `next start` (any host but Vercel) rejects
  // every request as UntrustedHost, middleware sees no session, and a
  // successful sign-in bounces straight back to /login.
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = (user as any).id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
