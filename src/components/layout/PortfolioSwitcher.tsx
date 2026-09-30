import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { PERSONAL_PORTFOLIO_ID, PERSONAL_PORTFOLIO_NAME } from '@/lib/portfolios';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Picks the portfolio on screen. Renders only for someone with the Family
 * plan or with extra portfolios already, so Free and Pro see no change.
 * `placement` picks the sidebar or the phone topbar; CSS shows one at a time.
 */
export function PortfolioSwitcher({ placement }: { placement: 'sidebar' | 'topbar' }) {
  const { user } = useAuth();
  const { has } = useEntitlements();
  const { activePortfolioId, activePortfolioName, extraPortfolios, switchPortfolio } = usePortfolio();
  const navigate = useNavigate();

  if (!user || (!has('portfolios.multiple') && extraPortfolios.length === 0)) return null;

  const options = [{ id: PERSONAL_PORTFOLIO_ID, name: PERSONAL_PORTFOLIO_NAME }, ...extraPortfolios];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`q-portfolio-switch q-portfolio-switch--${placement}`}
          aria-label={`Portfolio: ${activePortfolioName}. Switch portfolio`}
        >
          <span className="q-portfolio-switch-name">{activePortfolioName}</span>
          <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[208px]">
        <DropdownMenuRadioGroup value={activePortfolioId} onValueChange={(id) => void switchPortfolio(id)}>
          {options.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id} className="min-h-9">
              <span className="truncate">{p.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings#portfolios')} className="gap-2 min-h-9">
          <Settings size={15} strokeWidth={1.75} aria-hidden="true" />
          Manage portfolios
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
