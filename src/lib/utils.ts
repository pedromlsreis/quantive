import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MAX_SOURCE_NAME_LENGTH = 100;
// Disallow control characters (null bytes, newlines, tabs, DEL, etc.). The
// control-char range is exactly what we want to detect — eslint flags it on
// principle, but here it's the explicit intent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

export function sanitizeSourceName(raw: string): { value: string; error?: string } {
  if (CONTROL_CHAR_RE.test(raw)) return { value: raw.trim(), error: 'Source name contains invalid characters' };
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return { value: trimmed, error: 'Source name cannot be empty' };
  if (trimmed.length > MAX_SOURCE_NAME_LENGTH) return { value: trimmed, error: `Source name must be ${MAX_SOURCE_NAME_LENGTH} characters or fewer` };
  return { value: trimmed };
}
