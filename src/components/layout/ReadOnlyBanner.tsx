import { Link } from 'react-router-dom';
import { READ_ONLY_MESSAGES, usePortfolio } from '@/contexts/PortfolioContext';

/** Above every app page while the open portfolio takes no edits (Family has lapsed). */
export function ReadOnlyBanner() {
  const { readOnlyReason } = usePortfolio();
  if (!readOnlyReason) return null;
  return (
    <div className="q-demo-strip" role="note" aria-label="Read-only portfolio">
      <span className="q-tag">Read-only</span>
      <span>{READ_ONLY_MESSAGES[readOnlyReason]}</span>
      {readOnlyReason === 'needs_family' && (
        <Link to="/pricing#family" className="q-link-btn">See the Family plan</Link>
      )}
    </div>
  );
}
