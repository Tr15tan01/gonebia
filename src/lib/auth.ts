import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { createAdmin } from "@/lib/supabase/admin";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";

// This file (real providers, bcrypt, the Supabase admin client) is only ever
// imported by Node.js API routes and server components - never by
// middleware.ts, which uses the lighter auth.config.ts instead.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds, req) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        // Server-side lockout: 5 attempts per 15 minutes, keyed by the
        // account being targeted (stops brute-forcing ONE account from many
        // IPs) and lightly by IP too (stops one attacker spraying many
        // emails). This is the real, authoritative limit - it fails closed
        // regardless of what the frontend does or doesn't show.
        const ip = req?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (!rateLimit(`login:email:${email}`, 5, 15 * 60_000) || !rateLimit(`login:ip:${ip}`, 20, 15 * 60_000)) {
          return null;
        }

        const admin = createAdmin();
        const { data: user } = await admin
          .from("users")
          .select("id, email, password_hash, full_name")
          .eq("email", email)
          .maybeSingle();
        if (!user || !user.password_hash) return null; // no password set (e.g. Google-only account)

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.full_name || undefined };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /** Runs before a session is created. For Google, this app has no Auth.js
     *  adapter/database-sessions table - it manages its OWN `users` table -
     *  so this is where a Google sign-in gets resolved to (or creates) a row
     *  there, exactly like /api/register does for password sign-up. */
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true; // Credentials already resolved in authorize()
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      const admin = createAdmin();
      const { data: existing } = await admin.from("users").select("id").eq("email", email).maybeSingle();
      if (existing) {
        user.id = existing.id;
        return true;
      }

      const { data: created, error } = await admin
        .from("users")
        .insert({ email, full_name: user.name ?? null, password_hash: null })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[auth] failed to create user from Google sign-in:", error);
        return false;
      }
      // same setup /api/register does for a password sign-up
      await Promise.all([
        admin.from("profiles").insert({ id: created.id, email, full_name: user.name ?? null }),
        admin.from("user_preferences").insert({ user_id: created.id }),
      ]);
      user.id = created.id;
      return true;
    },
  },
});
