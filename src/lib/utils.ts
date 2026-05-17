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

/**
 * Parse a user-entered number that may use either US or European
 * conventions ("1,234.56", "1.234,56", "1 234,56", "1234.56", "1,5",
 * "1.234"). Whitespace (including NBSP) is treated as a thousand
 * separator. Anything outside digits/sign/separator/whitespace —
 * including currency symbols — is rejected, on the principle that
 * currency belongs in the explicit currency picker, not glued to the
 * value.
 *
 * Heuristic for a single separator with exactly three digits after it
 * (e.g. "1,234"): treat as a thousand grouping, so "1,234" → 1234.
 * One or two digits after a single separator is always decimal
 * ("1,5" → 1.5).
 *
 * Returns the parsed number on success, an error message string on
 * failure. `number | string` (rather than a tagged union) because this
 * project's tsconfig has `strictNullChecks: false`, under which
 * discriminated-union narrowing does not fire reliably; `typeof` does.
 */
export function parseLocalizedNumber(input: string): number | string {
  const raw = input.trim();
  if (raw === '') return 0;

  if (!/^[+-]?[\d.,\s]+$/.test(raw)) {
    return `"${raw}" — numbers only (no letters or currency symbols)`;
  }

  const sign = raw.startsWith('-') ? '-' : '';
  const body = raw.replace(/^[+-]/, '').replace(/\s/g, '');
  if (body === '') return `"${raw}" — not a number`;

  const dots = (body.match(/\./g) || []).length;
  const commas = (body.match(/,/g) || []).length;

  let normalized: string;
  if (dots === 0 && commas === 0) {
    normalized = body;
  } else if (dots > 0 && commas > 0) {
    // Mixed separators: the right-most occurrence is the decimal point;
    // every other one must be a thousand separator.
    const lastDot = body.lastIndexOf('.');
    const lastComma = body.lastIndexOf(',');
    const decIdx = Math.max(lastDot, lastComma);
    const intPart = body.slice(0, decIdx).replace(/[.,]/g, '');
    const decPart = body.slice(decIdx + 1);
    if (/[.,]/.test(decPart)) {
      return `"${raw}" — separator format not recognised`;
    }
    normalized = `${intPart}.${decPart}`;
  } else {
    const sep = dots > 0 ? '.' : ',';
    const parts = body.split(sep);
    if (parts.length === 2) {
      // Single separator: 3 digits after → thousand grouping; else decimal.
      // "1,234" → 1234 ; "1,5" → 1.5 ; "1,2345" → 1.2345.
      const dec = parts[1];
      normalized = dec.length === 3 ? parts.join('') : `${parts[0]}.${dec}`;
    } else {
      // Multiple of the same separator. Only valid if every group after
      // the first is exactly 3 digits — i.e. pure thousand-grouping like
      // "1,000,000". Otherwise reject; ambiguous "1.234.5" is a typo.
      const allThree = parts.slice(1).every(p => p.length === 3);
      if (!allThree) {
        return `"${raw}" — separator format not recognised`;
      }
      normalized = parts.join('');
    }
  }

  const value = Number(sign + normalized);
  if (!Number.isFinite(value)) {
    return `"${raw}" — not a number`;
  }
  return value;
}
