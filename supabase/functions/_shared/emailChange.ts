// A pending email change and the one-time token that confirms it. The request
// lives in the user's app_metadata, which only the service role can write.
// The emailed link holds the token and app_metadata holds only its SHA-256, so
// the JWT that carries app_metadata can't be turned back into a working link.
// Spec: docs/security/encryption.md §8.11.

import { brandedEmailHtml, escapeHtml } from "./email.ts";

export const PENDING_EMAIL_CHANGE_KEY = "pending_email_change";
export const EMAIL_CHANGE_TTL_SECONDS = 24 * 60 * 60;

export interface PendingEmailChange {
  /** The new address. */
  email: string;
  /** The sign-in email when the change was requested. */
  from: string;
  sent_at: string;
  expires_at: string;
  /** Hex SHA-256 of the link token. */
  token_hash: string;
}

export type EmailChangeVerdict = "ok" | "no_request" | "expired" | "changed";

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// 32 random bytes, base64url without padding.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_SHAPE.test(email) ? email : null;
}

export function isLinkToken(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN_SHAPE.test(raw);
}

export async function newEmailChangeRequest(
  from: string,
  email: string,
  now: Date,
): Promise<{ token: string; pending: PendingEmailChange }> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return {
    token,
    pending: {
      email,
      from: from.toLowerCase(),
      sent_at: now.toISOString(),
      expires_at: new Date(now.getTime() + EMAIL_CHANGE_TTL_SECONDS * 1000).toISOString(),
      token_hash: await sha256Hex(token),
    },
  };
}

export function readPendingEmailChange(appMetadata: unknown): PendingEmailChange | null {
  const raw = (appMetadata as Record<string, unknown> | null | undefined)?.[PENDING_EMAIL_CHANGE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const fields = ["email", "from", "sent_at", "expires_at", "token_hash"];
  return fields.every((k) => typeof p[k] === "string") ? (p as unknown as PendingEmailChange) : null;
}

// The token is compared before anything else, so a wrong one learns nothing
// about the request. "changed": the sign-in email moved after the request.
export async function checkEmailChangeToken(
  pending: PendingEmailChange | null,
  token: string,
  currentEmail: string,
  now: Date,
): Promise<EmailChangeVerdict> {
  if (!pending) return "no_request";
  if (!timingSafeEqual(await sha256Hex(token), pending.token_hash)) return "no_request";
  if (Date.parse(pending.expires_at) <= now.getTime()) return "expired";
  if (pending.from !== currentEmail.toLowerCase()) return "changed";
  return "ok";
}

/** "sam.new@example.com" → "s•••@example.com", for the notice to the old address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email[0]}•••${email.slice(at)}` : email;
}

// Sent to the new address. It doesn't name the current address: a mistyped
// new address could belong to a stranger.
export function confirmationEmail(link: string): { subject: string; html: string; text: string } {
  const button =
    `<a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Confirm new email</a>`;
  const bodyHtml = `
    <p style="margin: 0 0 16px;">You asked to make this the email for your Quantive account. Open the link below to confirm. If the page asks you to sign in, use the email you sign in with now and your password.</p>
    <p style="margin: 0 0 24px;">${button}</p>
    <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280;">Or paste this link into your browser:<br /><a href="${escapeHtml(link)}" style="color: #6b7280; word-break: break-all;">${escapeHtml(link)}</a></p>
    <p style="margin: 0; font-size: 13px; color: #6b7280;">The link works once and expires after 24 hours. Your password and your encrypted data stay as they are.</p>
  `;
  const footerHtml =
    "If you didn't ask for this, ignore this email. Nothing changes unless someone signed in to that account confirms.";
  return {
    subject: "Confirm your new Quantive email",
    html: brandedEmailHtml({ heading: "Confirm your new email", bodyHtml, footerHtml }),
    text:
      "Confirm your new email\n\n" +
      "You asked to make this the email for your Quantive account. Open the link below to confirm. " +
      "If the page asks you to sign in, use the email you sign in with now and your password.\n\n" +
      `${link}\n\n` +
      "The link works once and expires after 24 hours. Your password and your encrypted data stay as they are.\n\n" +
      "If you didn't ask for this, ignore this email. Nothing changes unless someone signed in to that account confirms.",
  };
}

// Sent to the old address once the change is done. In the usual case that is
// the owner's own inbox; if the change wasn't theirs, it is how they find out.
export function changedNoticeEmail(newEmail: string, when: Date): { subject: string; html: string; text: string } {
  const masked = maskEmail(newEmail);
  const stamp = `${when.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const bodyHtml = `
    <p style="margin: 0 0 16px;">The email for your Quantive account was changed from this address to ${escapeHtml(masked)} on ${escapeHtml(stamp)}.</p>
    <p style="margin: 0 0 16px;">If you made this change, there's nothing to do. Sign in with the new address from now on; your password stays the same.</p>
    <p style="margin: 0;">If you didn't, reply to this email straight away.</p>
  `;
  return {
    subject: "Your Quantive email was changed",
    html: brandedEmailHtml({ heading: "Your sign-in email was changed", bodyHtml }),
    text:
      "Your sign-in email was changed\n\n" +
      `The email for your Quantive account was changed from this address to ${masked} on ${stamp}.\n\n` +
      "If you made this change, there's nothing to do. Sign in with the new address from now on; your password stays the same.\n\n" +
      "If you didn't, reply to this email straight away.",
  };
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
