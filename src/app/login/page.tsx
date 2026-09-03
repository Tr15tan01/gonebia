import { LoginClient } from "./login-client";

export default function LoginPage() {
  // Server-only check: Google sign-in is available whenever the actual
  // credentials are configured - no separate public flag to keep in sync
  // with them (and no NEXT_PUBLIC_ variable needed for this at all, which
  // was tripping up Vercel's env var validation).
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <LoginClient googleEnabled={googleEnabled} />;
}
