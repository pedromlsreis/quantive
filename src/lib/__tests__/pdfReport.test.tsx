import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import {
  buildWealthReport,
  trailingCagrFromSnapshots,
  type ReportInput,
} from '@/lib/pdfReport';
import type { Snapshot } from '@/lib/types';

function snap(date: string, total: number): Snapshot {
  return { date: new Date(date), total, sources: [] };
}

function baseInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    userName: 'Test user',
    generatedAt: new Date('2026-05-19T00:00:00Z'),
    periodLabel: '2026-01-01 – 2026-05-19',
    period: 'this_year',
    baseCurrency: 'EUR',
    baseSymbol: '€',
    snapshotsInPeriod: [snap('2026-01-31', 10000), snap('2026-05-19', 12000)],
    allSnapshots: [snap('2026-01-31', 10000), snap('2026-05-19', 12000)],
    topSources: [
      { name: 'Brokerage', value: 8000, percentOfTotal: 66.67 },
      { name: 'Savings', value: 4000, percentOfTotal: 33.33 },
    ],
    volatilitySplit: { volatile: 60, nonVolatile: 40 },
    liquiditySplit: { liquid: 75, illiquid: 25 },
    trajectoryPng: null,
    ...overrides,
  };
}

/**
 * Extract a stable structural fingerprint from the report's React element
 * tree — section titles, headline text, source names, presence/absence of the
 * forecast block. We intentionally do NOT snapshot the raw PNG data URL (the
 * plan says "structural — no raster images in the snapshot") nor the bag of
 * @react-pdf style numerics; both are renderer concerns.
 */
function describeReportTree(el: ReactElement): {
  sectionTitles: string[];
  headlineText: string;
  sourceNames: string[];
  hasForecastSection: boolean;
  hasTrajectoryImage: boolean;
} {
  const sectionTitles: string[] = [];
  const sourceNames: string[] = [];
  let headlineText = '';
  let hasForecastSection = false;
  let hasTrajectoryImage = false;

  const walk = (node: unknown): void => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object' && 'props' in node) {
      const obj = node as {
        type?: unknown;
        props?: { children?: unknown; style?: unknown; src?: unknown };
      };
      const props = obj.props ?? {};
      const styleStr = props.style ? JSON.stringify(props.style) : '';

      // Headline value
      if (styleStr.includes('"fontSize":24')) {
        if (typeof props.children === 'string') headlineText = props.children;
      }
      // Section titles
      if (styleStr.includes('"textTransform":"uppercase"')) {
        if (typeof props.children === 'string') {
          sectionTitles.push(props.children);
          if (props.children === 'Forecast') hasForecastSection = true;
        }
      }
      // Trajectory image — @react-pdf Image carries `src`.
      if (props.src) hasTrajectoryImage = true;
      // Source rows: any child of a row with width:90 is the value cell; the
      // first <Text> in a sourceRow with flex:1 is the name.
      if (styleStr.includes('"flex":1') && typeof props.children === 'string') {
        // Filter out the spacer flex:1 we use elsewhere by requiring a string body.
        if (props.children.length > 0 && props.children.length < 100) {
          sourceNames.push(props.children);
        }
      }
      walk(props.children);
    }
  };
  walk(el);
  return { sectionTitles, headlineText, sourceNames, hasForecastSection, hasTrajectoryImage };
}

describe('buildWealthReport — document tree', () => {
  it('renders the canonical seven sections (without forecast when <24mo history)', () => {
    const tree = buildWealthReport(baseInput());
    const desc = describeReportTree(tree);
    expect(desc.sectionTitles).toEqual([
      'Net worth at period end',
      'Allocation',
      'Trajectory',
      'Top sources',
    ]);
    expect(desc.hasForecastSection).toBe(false);
  });

  it('renders the conditional forecast section when ≥24 months of history exist', () => {
    const history: Snapshot[] = [
      snap('2023-01-31', 8000),
      snap('2024-01-31', 9000),
      snap('2025-01-31', 10000),
      snap('2026-01-31', 11000),
    ];
    const tree = buildWealthReport(
      baseInput({ allSnapshots: history, snapshotsInPeriod: history }),
    );
    const desc = describeReportTree(tree);
    expect(desc.hasForecastSection).toBe(true);
    expect(desc.sectionTitles).toContain('Forecast');
  });

  it('lists the supplied top sources in order', () => {
    const tree = buildWealthReport(baseInput());
    const desc = describeReportTree(tree);
    expect(desc.sourceNames).toEqual(['Brokerage', 'Savings']);
  });

  it('embeds the trajectory image when a PNG data URL is supplied', () => {
    const tree = buildWealthReport(
      baseInput({ trajectoryPng: 'data:image/png;base64,AAAA' }),
    );
    const desc = describeReportTree(tree);
    expect(desc.hasTrajectoryImage).toBe(true);
  });

  it('omits the trajectory image when no PNG was rasterised', () => {
    const tree = buildWealthReport(baseInput({ trajectoryPng: null }));
    const desc = describeReportTree(tree);
    expect(desc.hasTrajectoryImage).toBe(false);
  });

  it('renders a structural snapshot that is independent of raster data', () => {
    const tree = buildWealthReport(baseInput());
    expect(describeReportTree(tree)).toMatchSnapshot();
  });
});

describe('trailingCagrFromSnapshots', () => {
  it('returns null when fewer than 24 months of history exist', () => {
    expect(
      trailingCagrFromSnapshots([snap('2026-01-01', 1000), snap('2026-05-19', 1200)]),
    ).toBeNull();
  });

  it('returns null for empty / single-snapshot input', () => {
    expect(trailingCagrFromSnapshots([])).toBeNull();
    expect(trailingCagrFromSnapshots([snap('2026-01-01', 1000)])).toBeNull();
  });

  it('computes a positive CAGR for a growing 3-year window', () => {
    // 10k → ~13.31k over 3 years ≈ 10% CAGR.
    const cagr = trailingCagrFromSnapshots([
      snap('2023-05-19', 10_000),
      snap('2024-05-19', 11_000),
      snap('2025-05-19', 12_100),
      snap('2026-05-19', 13_310),
    ]);
    expect(cagr).not.toBeNull();
    expect(cagr!).toBeCloseTo(0.1, 2);
  });

  it('returns null when an endpoint is non-positive', () => {
    expect(
      trailingCagrFromSnapshots([
        snap('2023-01-01', 0),
        snap('2024-01-01', 100),
        snap('2025-01-01', 200),
        snap('2026-01-01', 300),
      ]),
    ).toBeNull();
  });
});
