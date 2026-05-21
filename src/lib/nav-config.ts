import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, PieChart, Database,
  TrendingUp, Activity, Target,
  Settings,
} from 'lucide-react';

export type NavSectionId = 'workspace' | 'plan' | 'account';

export interface NavItem {
  to: string;
  label: string;
  /** Optional shorter label used in the mobile tab bar (60–80px slot). */
  mobileLabel?: string;
  /** Lucide icon component; each consumer chooses its own size. */
  Icon: LucideIcon;
  /** Keyboard shortcut surfaced in the sidebar (single digit). */
  shortcut?: string;
  /** Extra keywords for global search matching. */
  keywords?: string;
  /**
   * Whether this leaf gets a first-class slot in the mobile bottom bar.
   * Items not marked primary are reachable from the "More" sheet.
   * Limit primaries to 4 (the 5th tab is reserved for "More").
   */
  mobilePrimary?: boolean;
}

export interface NavSection {
  id: NavSectionId;
  /** Sidebar section header on desktop and inside the More sheet on mobile. */
  title: string;
  items: NavItem[];
}

/**
 * Single source of truth for app navigation. Consumed by AppShell (sidebar),
 * MobileTabBar (bottom bar + More sheet) and GlobalSearch (Cmd-K palette) so
 * that adding a page in one place surfaces it everywhere.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    title: 'Workspace',
    items: [
      {
        to: '/dashboard',
        label: 'Overview',
        Icon: LayoutDashboard,
        shortcut: '1',
        keywords: 'dashboard home kpi',
        mobilePrimary: true,
      },
      {
        to: '/allocations',
        label: 'Allocations',
        mobileLabel: 'Alloc',
        Icon: PieChart,
        shortcut: '2',
        keywords: 'breakdown treemap donut',
        mobilePrimary: true,
      },
      {
        to: '/sources',
        label: 'Sources',
        Icon: Database,
        shortcut: '3',
        keywords: 'accounts assets',
        mobilePrimary: true,
      },
    ],
  },
  {
    id: 'plan',
    title: 'Plan',
    items: [
      {
        to: '/forecast',
        label: 'Forecast',
        Icon: TrendingUp,
        shortcut: '4',
        keywords: 'projection scenario future',
        mobilePrimary: true,
      },
      {
        to: '/performance',
        label: 'Performance',
        Icon: Activity,
        shortcut: '5',
        keywords: 'benchmark inflation s&p sp500 history month looking back',
      },
      {
        to: '/goals',
        label: 'Goals',
        Icon: Target,
        shortcut: '6',
        keywords: 'milestones targets progress',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      {
        to: '/settings',
        label: 'Settings',
        Icon: Settings,
        keywords: 'preferences currency',
      },
    ],
  },
];

/** Flat list, useful for global search and route lookups. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Items rendered as first-class tabs in the mobile bottom bar. */
export const MOBILE_PRIMARY_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter(
  (i) => i.mobilePrimary,
);

/** Items surfaced inside the mobile "More" sheet, grouped by section. */
export const MOBILE_MORE_SECTIONS: NavSection[] = NAV_SECTIONS.map((s) => ({
  ...s,
  items: s.items.filter((i) => !i.mobilePrimary),
})).filter((s) => s.items.length > 0);
