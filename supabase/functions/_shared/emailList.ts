// The "Keep me posted" list: double opt-in, unsubscribe and the consent record.
// email-signup stores the SHA-256 of a one-time confirm token and emails the
// token; email-list hashes what the link brings back and looks the row up by
// that hash, so the table never holds a working confirm link.

import { brandedEmailHtml, escapeHtml } from "./email.ts";

// Must match the purge interval in migration 20261025120000, privacy policy §3
// and §7, and EmailUpdatesPage's expired copy (emailList.test.ts checks the
// migration).
export const CONFIRM_TTL_DAYS = 7;
/** A repeat signup re-sends the confirmation email at most this often. */
export const RESEND_AFTER_MS = 10 * 60 * 1000;
/** Confirmation emails one address can receive until it is confirmed or purged. */
export const MAX_CONFIRMATIONS_PER_ADDRESS = 3;
/** Confirmation emails across all addresses in a rolling day; past it, signup refuses and alerts. */
export const DAILY_CONFIRMATION_CAP = 100;
/**
 * Stored on the signup row when its link is sent and copied into the consent
 * record on confirm, so a dispute can show which confirmation email the address received.
 */
export const CONFIRMATION_EMAIL_VERSION = "2026-10-26";

// 32 random bytes, base64url without padding.
const CONFIRM_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const UNSUBSCRIBE_TOKEN_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isConfirmToken(raw: unknown): raw is string {
  return typeof raw === "string" && CONFIRM_TOKEN_SHAPE.test(raw);
}

export function isUnsubscribeToken(raw: unknown): raw is string {
  return typeof raw === "string" && UNSUBSCRIBE_TOKEN_SHAPE.test(raw);
}

export async function newConfirmToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, hash: await sha256Hex(token) };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

/** Keyed hash of an address for the consent record, so the record never holds the address itself. */
export async function emailHmac(email: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(email.trim().toLowerCase())));
}

export function isConfirmExpired(confirmSentAt: string, now: Date): boolean {
  return Date.parse(confirmSentAt) + CONFIRM_TTL_DAYS * 24 * 60 * 60 * 1000 <= now.getTime();
}

export interface SignupRow {
  confirmed_at: string | null;
  confirm_sent_at: string | null;
  confirm_send_count: number;
}

/** Whether a signup for this address should send a confirmation email now (null: a new address). */
export function shouldSendConfirmation(existing: SignupRow | null, now: Date): boolean {
  if (!existing) return true;
  if (existing.confirmed_at || existing.confirm_send_count >= MAX_CONFIRMATIONS_PER_ADDRESS) return false;
  return !existing.confirm_sent_at || now.getTime() - Date.parse(existing.confirm_sent_at) >= RESEND_AFTER_MS;
}

export type ConfirmVerdict = "confirm" | "already" | "expired" | "invalid";

/** What a confirm link does for the row its token matched (null: no row, or a replaced link). */
export function confirmVerdict(
  row: { confirmed_at: string | null; confirm_sent_at: string | null } | null,
  now: Date,
): ConfirmVerdict {
  if (!row?.confirm_sent_at) return "invalid";
  // A used link keeps working, so opening it again still says "you're on the list".
  if (row.confirmed_at) return "already";
  return isConfirmExpired(row.confirm_sent_at, now) ? "expired" : "confirm";
}

// It promises nothing beyond what the privacy policy says: one email to
// confirm, nothing else until then, and deletion if it goes unconfirmed.
export function confirmationEmail(link: string): { subject: string; html: string; text: string } {
  const days = `${CONFIRM_TTL_DAYS} days`;
  const button =
    `<a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Confirm my email</a>`;
  const bodyHtml = `
    <p style="margin: 0 0 16px;">You asked for occasional updates about Quantive. Open the link below to confirm this address. Until you do, nothing else arrives.</p>
    <p style="margin: 0 0 24px;">${button}</p>
    <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280;">Or paste this link into your browser:<br /><a href="${escapeHtml(link)}" style="color: #6b7280; word-break: break-all;">${escapeHtml(link)}</a></p>
    <p style="margin: 0; font-size: 13px; color: #6b7280;">The link expires after ${days}. Every update has an unsubscribe link.</p>
  `;
  const footerHtml =
    `If you didn't ask for this, ignore this email. The address is deleted after ${days} and nothing else is sent.`;
  return {
    subject: "Confirm your Quantive updates",
    html: brandedEmailHtml({ heading: "Confirm your email", bodyHtml, footerHtml }),
    text:
      "Confirm your email\n\n" +
      "You asked for occasional updates about Quantive. Open the link below to confirm this address. " +
      "Until you do, nothing else arrives.\n\n" +
      `${link}\n\n` +
      `The link expires after ${days}. Every update has an unsubscribe link.\n\n` +
      `If you didn't ask for this, ignore this email. The address is deleted after ${days} and nothing else is sent.`,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}
