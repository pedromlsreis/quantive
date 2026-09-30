import { usePortfolio } from '@/contexts/PortfolioContext';
import { openComposer } from '@/lib/appEvents';

/** Inline note above the overview while demo data is loaded; never over data. */
export function DemoBanner() {
  const { clearData } = usePortfolio();
  return (
    <div className="q-demo-strip" role="note" aria-label="Demo data notice">
      <span className="q-tag">Demo</span>
      <span>{"You're looking at a demo portfolio. Figures are illustrative."}</span>
      <button
        type="button"
        className="q-link-btn"
        onClick={() => {
          clearData();
          openComposer();
        }}
      >
        Use my own numbers
      </button>
    </div>
  );
}
