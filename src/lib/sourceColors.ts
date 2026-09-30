import type { Snapshot } from '@/lib/types';

/** Categorical slots in index.css (`--series-1`…`--series-7`); the rest share "Other". */
export const SERIES_SLOTS = 7;
export const OTHER_COLOR = 'var(--series-other)';

/**
 * Source name → series colour, so a source keeps one colour in every chart,
 * legend and table. Ranked by the latest snapshot's value (largest first,
 * then name), so filters and history views never repaint survivors.
 * Sources absent from the latest snapshot, non-positive holdings and ranks
 * past the slot count fall back to the neutral "Other".
 */
export function buildSourceColors(latest: Snapshot | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!latest) return map;
  const ranked = latest.sources
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  ranked.slice(0, SERIES_SLOTS).forEach((s, i) => map.set(s.name, `var(--series-${i + 1})`));
  return map;
}

export function sourceColor(map: Map<string, string>, name: string): string {
  return map.get(name) ?? OTHER_COLOR;
}

/**
 * The series slots as sRGB hex for print (the PDF report), converted from the
 * OKLCH values in index.css; the last entry is "Other".
 */
const SERIES_PRINT_HEX = ['#436eb4', '#c18434', '#2a9cae', '#cc675c', '#9256a0', '#969841', '#b0597e'];
const OTHER_PRINT_HEX = '#6d6861';

/** The print colour for a value from buildSourceColors (`var(--series-N)` or Other). */
export function printColor(cssColor: string): string {
  const m = /--series-(\d)\)/.exec(cssColor);
  return m ? SERIES_PRINT_HEX[Number(m[1]) - 1] ?? OTHER_PRINT_HEX : OTHER_PRINT_HEX;
}
