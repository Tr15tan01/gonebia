/** Client-side password policy: 8-24 chars + common/breached checks.
 *  Breach check uses HIBP k-anonymity: the password is SHA-1 hashed locally
 *  and only the 5-char hash PREFIX is sent - the password never leaves the device. */

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "mustang", "letmein1", "welcome1", "welcome123",
  "iloveyou", "monkey123", "dragon123", "sunshine", "princess", "football",
  "baseball", "superman", "batman", "trustno1", "whatever", "asdfghjk",
  "1q2w3e4r", "qazwsx", "starwars", "hello123", "freedom", "summer2024",
  "summer2025", "winter2024", "changeme", "admin123", "master123",
]);

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 24;

/** Synchronous structural + list checks. Returns an error message or null. */
export function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters required.`;
  if (pw.length > PASSWORD_MAX) return `At most ${PASSWORD_MAX} characters allowed.`;
  if (COMMON.has(pw.toLowerCase())) {
    return "This password is too common or appears in known breaches. Please choose another.";
  }
  return null;
}

/** Async k-anonymity check against real breached-password corpus.
 *  Returns true if the password is known-breached. On network failure we
 *  return false (don't lock people out over a flaky connection). */
export async function isBreached(pw: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(pw);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return false;
    const text = await res.text();
    return text
      .split("\n")
      .some((line) => line.split(":")[0].trim() === suffix);
  } catch {
    return false;
  }
}
