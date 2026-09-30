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
 * A stable structural fingerprint of the report's React element tree, read
 * from its named parts (displayName): section titles, the headline figure,
 * source rows, the forecast section and the trajectory image. Raster data and
 * @react-pdf style numbers are renderer concerns and stay out of it.
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
  let hasTrajectoryImage = false;

  const walk = (node: unknown): void => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object' && 'props' in node) {
      const obj = node as { type?: { displayName?: string }; props?: Record<string, unknown> };
      const props = obj.props ?? {};
      const role = obj.type?.displayName;
      if (role === 'PdfSection' && typeof props.title === 'string') sectionTitles.push(props.title);
      if (role === 'PdfSectionTitle' && typeof props.children === 'string') sectionTitles.push(props.children);
      if (role === 'PdfFigure' && typeof props.children === 'string') headlineText = props.children;
      if (role === 'PdfSourceRow' && typeof props.name === 'string') sourceNames.push(props.name);
      // Trajectory image: @react-pdf Image carries `src`.
      if (props.src) hasTrajectoryImage = true;
      walk(props.children);
    }
  };
  walk(el);
  return {
    sectionTitles,
    headlineText,
    sourceNames,
    hasForecastSection: sectionTitles.includes('In 3 years at your recent pace'),
    hasTrajectoryImage,
  };
}

describe('buildWealthReport — document tree', () => {
  it('renders the chart, sources and allocation sections, without a forecast under 24 months', () => {
    const tree = buildWealthReport(baseInput());
    const desc = describeReportTree(tree);
    expect(desc.sectionTitles).toEqual([
      'Net worth over the period',
      'Largest sources',
      'Allocation',
    ]);
    expect(desc.hasForecastSection).toBe(false);
  });

  it('leads with the period-end total in the shared money format', () => {
    const desc = describeReportTree(buildWealthReport(baseInput()));
    expect(desc.headlineText).toBe('€12,000');
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
    expect(desc.sectionTitles).toContain('In 3 years at your recent pace');
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
