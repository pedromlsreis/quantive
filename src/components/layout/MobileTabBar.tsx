import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PieChart, TrendingUp, Database, Settings } from 'lucide-react';

interface TabItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  { to: '/dashboard',   label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { to: '/allocations', label: 'Alloc',    icon: <PieChart size={18} /> },
  { to: '/forecast',    label: 'Forecast', icon: <TrendingUp size={18} /> },
  { to: '/sources',     label: 'Sources',  icon: <Database size={18} /> },
  { to: '/settings',    label: 'You',      icon: <Settings size={18} /> },
];

export function MobileTabBar() {
  return (
    <nav className="q-mobile-tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `q-mobile-tab${isActive ? ' is-active' : ''}`}
          aria-label={t.label}
        >
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
