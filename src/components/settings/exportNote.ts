/**
 * The note above Settings → Your data. Exports cover the open portfolio, and
 * the buttons are off while it has no entries, so the note says which
 * portfolio and why. Null when there's nothing worth saying.
 */
export function exportNote({ name, multiple, hasEntries, loading, allPortfolios = false }: {
  /** The open portfolio's name. */
  name: string;
  /** The account can open more than one portfolio. */
  multiple: boolean;
  hasEntries: boolean;
  loading: boolean;
  /**
   * "All portfolios" is open. Its entries are carried forward and scaled by
   * share, so exporting them would be a backup that restores the wrong numbers.
   */
  allPortfolios?: boolean;
}): string | null {
  if (allPortfolios) return 'Exports cover one portfolio at a time. Open one from the portfolio menu to export it.';
  if (loading) return null;
  if (multiple && name) {
    const scope = `Exports cover ${name}, the portfolio that's open.`;
    return hasEntries ? scope : `${scope} It has no entries yet.`;
  }
  return hasEntries ? null : 'Nothing to export until you add an entry.';
}
