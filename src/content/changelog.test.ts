import { describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog';

// A day's grace: an entry is dated by the founder's local day, which can be ahead of UTC.
const latest = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('changelog', () => {
  it('has entries, newest first, each dated on a real day that is not in the future', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry.date);
      expect(entry.date <= latest).toBe(true);
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('uses unique ids that App.tsx scrolls to and that cannot collide with month anchors', () => {
    const ids = CHANGELOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(id).not.toMatch(/^[a-z]+-\d{4}$/);
    }
  });

  it('writes titles in sentence case without a full stop, and bodies as one to three sentences', () => {
    for (const { title, body } of CHANGELOG) {
      expect(title).toMatch(/^[A-Z]/);
      expect(title).not.toMatch(/[.!?]$/);
      expect(body).toMatch(/\.$/);
      expect(body.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(3);
    }
  });

  // The page is public and the repo is public: no personal data, no markup,
  // and the house copy rules (straight apostrophes, no exclamation marks).
  it('keeps personal data, markup and banned punctuation out of the copy', () => {
    for (const { title, body } of CHANGELOG) {
      const text = `${title} ${body}`;
      expect(text).not.toMatch(/[‘’“”]/);
      expect(text).not.toMatch(/[!<>]/);
      expect(text).not.toMatch(/\S+@\S+\.\S+/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });
});
