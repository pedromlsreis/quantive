import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';

const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  EUR: '€ EUR',
  USD: '$ USD',
  GBP: '£ GBP',
  NOK: 'NOK',
};

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { clearData } = usePortfolio();
  const { currency, setCurrency, allCurrencies } = useCurrency();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDisplayName(data.display_name);
      });
  }, [user]);

  if (!user) return null;

  const label = displayName || user.email || 'User';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
          aria-label="Account menu"
        >
          <User className="h-4 w-4" />
          <span className="hidden max-w-[120px] truncate sm:inline">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm">{displayName || 'Signed in'}</span>
          {user.email && (
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Currency
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currency.code}
          onValueChange={(v) => setCurrency(v as CurrencyCode)}
        >
          {allCurrencies.map((c) => (
            <DropdownMenuRadioItem key={c.code} value={c.code}>
              {CURRENCY_LABELS[c.code]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            clearData();
            signOut();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
