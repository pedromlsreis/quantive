import { useCallback, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { buildSourceColors, sourceColor } from '@/lib/sourceColors';

/**
 * Stable colour per source for the current portfolio. Derived in memory from
 * the unfiltered snapshots, never stored, so it resets with the user.
 */
export function useSourceColors(): (name: string) => string {
  const { allSnapshots } = usePortfolio();
  const latest = allSnapshots[allSnapshots.length - 1];
  const map = useMemo(() => buildSourceColors(latest), [latest]);
  return useCallback((name: string) => sourceColor(map, name), [map]);
}
