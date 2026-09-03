import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Uses the lightweight, Edge-safe auth config directly (not @/lib/auth) -
// middleware runs on the Edge runtime and must never pull in bcryptjs or the
// Supabase admin client, which the real Credentials provider needs.
const { auth } = NextAuth(authConfig);

const PROTECTED = ["/dashboard", "/tasks", "/timeline", "/search", "/chat", "/insights", "/books", "/people", "/graph", "/settings", "/discover", "/agents"];

export default auth((req) => {
  const user = req.auth?.user;
  const path = req.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = req.nextUrl.clone(); url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = req.nextUrl.clone(); url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|manifest.webmanifest|sw.js|favicon.ico).*)"] };
