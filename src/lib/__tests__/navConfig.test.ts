import { describe, it, expect } from 'vitest';
import {
  NAV_SECTIONS,
  ALL_NAV_ITEMS,
  MOBILE_PRIMARY_ITEMS,
  MOBILE_MORE_SECTIONS,
} from '../nav-config';

// Single source of truth for sidebar / mobile-tabbar / global-search.
// These derived lists are computed at module load — pin their invariants so
// a renamed/reshuffled item can't silently break navigation surfaces.

describe('nav-config — top-level shape', () => {
  it('declares the three canonical sections in order', () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(['workspace', 'plan', 'account']);
  });

  it('each section has at least one item with a route and a label', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.to.startsWith('/')).toBe(true);
        expect(item.label.length).toBeGreaterThan(0);
        // Icon is a Lucide ForwardRefExoticComponent — function in JS terms or
        // an object once wrapped by React.forwardRef. Either way, it must be
        // present and renderable.
        expect(item.Icon).toBeDefined();
        expect(['function', 'object']).toContain(typeof item.Icon);
      }
    }
  });

  it('every route is unique across sections', () => {
    const all = NAV_SECTIONS.flatMap((s) => s.items).map((i) => i.to);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keyboard shortcuts are unique among items that declare one', () => {
    const shortcuts = NAV_SECTIONS.flatMap((s) => s.items)
      .map((i) => i.shortcut)
      .filter((s): s is string => Boolean(s));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});

describe('nav-config — ALL_NAV_ITEMS', () => {
  it('flattens every section in declaration order', () => {
    const expected = NAV_SECTIONS.flatMap((s) => s.items).map((i) => i.to);
    expect(ALL_NAV_ITEMS.map((i) => i.to)).toEqual(expected);
  });
});

describe('nav-config — MOBILE_PRIMARY_ITEMS', () => {
  it('contains exactly the items marked mobilePrimary', () => {
    const expected = ALL_NAV_ITEMS.filter((i) => i.mobilePrimary).map((i) => i.to);
    expect(MOBILE_PRIMARY_ITEMS.map((i) => i.to)).toEqual(expected);
  });

  it('caps at 4 items so the 5th tab can remain "More"', () => {
    // Material Design's bottom-nav limit is 5 — with "More" reserved, we
    // can host at most 4 primary tabs. Violating this fills the bar and
    // pushes "More" off-screen.
    expect(MOBILE_PRIMARY_ITEMS.length).toBeLessThanOrEqual(4);
  });
});

describe('nav-config — MOBILE_MORE_SECTIONS', () => {
  it('excludes all primary items but preserves section structure', () => {
    for (const section of MOBILE_MORE_SECTIONS) {
      for (const item of section.items) {
        expect(item.mobilePrimary).toBeFalsy();
      }
    }
  });

  it('only includes sections that have at least one non-primary item', () => {
    for (const section of MOBILE_MORE_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('together with MOBILE_PRIMARY_ITEMS covers every nav item', () => {
    const primary = new Set(MOBILE_PRIMARY_ITEMS.map((i) => i.to));
    const more = new Set(MOBILE_MORE_SECTIONS.flatMap((s) => s.items.map((i) => i.to)));
    const union = new Set([...primary, ...more]);
    expect(union).toEqual(new Set(ALL_NAV_ITEMS.map((i) => i.to)));
    // And the sets are disjoint — no item should appear in both surfaces.
    const intersection = [...primary].filter((to) => more.has(to));
    expect(intersection).toEqual([]);
  });
});
