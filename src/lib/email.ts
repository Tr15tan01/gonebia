import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL || "TimelyMemo <noreply@timelymemo.app>";

/** Returns null (rather than throwing) when RESEND_API_KEY isn't configured,
 *  so local dev / early setups don't hard-crash - callers should treat a
 *  null return as "couldn't send" and log/report it, not silently succeed. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[email] RESEND_API_KEY not configured - email NOT sent:", { to, subject });
    return false;
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) { console.error("[email] Resend rejected the send:", error); return false; }
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: "Reset your TimelyMemo password",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #292524;">
        <h2 style="margin-bottom: 8px;">Reset your password</h2>
        <p>Someone (hopefully you) asked to reset the password on your TimelyMemo account.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background:#b45309;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Reset password
          </a>
        </p>
        <p style="color:#78716c;font-size:13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email - your password won't change.</p>
      </div>
    `,
  };
}

export function verifyEmailEmail(verifyUrl: string): { subject: string; html: string } {
  return {
    subject: "Verify your TimelyMemo email",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #292524;">
        <h2 style="margin-bottom: 8px;">Confirm your email</h2>
        <p>Welcome to TimelyMemo - please confirm this is your email address to finish setting up your account.</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="background:#b45309;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Verify email
          </a>
        </p>
        <p style="color:#78716c;font-size:13px;">This link expires in 24 hours. If you didn't create a TimelyMemo account, you can safely ignore this email.</p>
      </div>
    `,
  };
}
