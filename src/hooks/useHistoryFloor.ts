import { useMemo } from 'react';
import { useEntitlements } from './useEntitlements';

const FREE_HISTORY_MONTHS = 12;

// Date below which free-tier users do not get analysis or fully-rendered chart.
// Returns null for users entitled to full history (e.g. Pro).
export function useHistoryFloor(): Date | null {
  const { has } = useEntitlements();
  return useMemo(() => {
    if (has('history.full')) return null;
    const floor = new Date();
    floor.setMonth(floor.getMonth() - FREE_HISTORY_MONTHS);
    floor.setHours(0, 0, 0, 0);
    return floor;
  }, [has]);
}
