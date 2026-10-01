import { describe, expect, it } from 'vitest';
import { exportNote } from '../exportNote';

const base = { name: 'Personal', multiple: false, hasEntries: true, loading: false };

describe('exportNote', () => {
  it('says nothing for a single portfolio with entries', () => {
    expect(exportNote(base)).toBeNull();
  });

  it('explains the disabled buttons on an empty single portfolio', () => {
    expect(exportNote({ ...base, hasEntries: false })).toBe('Nothing to export until you add an entry.');
  });

  it('names the open portfolio when there are several', () => {
    expect(exportNote({ ...base, name: 'Joint', multiple: true }))
      .toBe("Exports cover Joint, the portfolio that's open.");
  });

  it('names the open portfolio and says it is empty', () => {
    expect(exportNote({ ...base, name: 'Joint', multiple: true, hasEntries: false }))
      .toBe("Exports cover Joint, the portfolio that's open. It has no entries yet.");
  });

  it('stays quiet while the portfolio loads', () => {
    expect(exportNote({ ...base, multiple: true, hasEntries: false, loading: true })).toBeNull();
  });
});
