import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PieChart, TrendingUp, Database, Settings,
  Plus, Menu, Shield,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AddMeasurementModal } from '@/components/dashboard/AddMeasurementModal';
import { SyncIndicator } from '@/components/dashboard/SyncIndicator';
import { AuthButton } from '@/components/dashboard/AuthButton';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Overview',    icon: <LayoutDashboard size={15} />, shortcut: '1' },
  { to: '/allocations', label: 'Allocations', icon: <PieChart size={15} />,          shortcut: '2' },
  { to: '/forecast',   label: 'Forecast',    icon: <TrendingUp size={15} />,         shortcut: '3' },
  { to: '/sources',    label: 'Sources',     icon: <Database size={15} />,           shortcut: '4' },
];

const SECONDARY_NAV: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: <Settings size={15} /> },
  { to: '/security', label: 'Security', icon: <Shield size={15} /> },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Overview',
  '/allocations':  'Allocations',
  '/forecast':     'Forecast',
  '/sources':      'Sources',
  '/settings':     'Settings',
  '/security':     'Security',
};

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'Q';

  return (
    <>
      <div
        className={`q-sidebar-overlay${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`q-sidebar${isOpen ? ' is-open' : ''}`}>
        {/* Brand */}
        <div className="q-side-brand">
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 'var(--r-2)',
              background: 'var(--accent-faint-raw)', border: '1px solid var(--accent-soft-raw)',
              display: 'grid', placeItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-raw)' }}>Q</span>
            </div>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.02em' }}>Quantive</span>
          </button>
        </div>

        {/* Primary nav */}
        <nav className="q-nav">
          <div className="q-nav-section-title">Workspace</div>
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `q-nav-item${isActive ? ' is-active' : ''}`}
              onClick={onClose}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.shortcut && <span className="q-nav-shortcut">{item.shortcut}</span>}
            </NavLink>
          ))}

          <div style={{ height: 8 }} />
          <div className="q-nav-section-title">Account</div>
          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `q-nav-item${isActive ? ' is-active' : ''}`}
              onClick={onClose}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="q-side-foot">
          <div className="q-side-card">
            <div className="q-side-card-title">Cloud sync · End-to-end</div>
            <div className="q-side-card-body">
              All snapshots encrypted on-device with XChaCha20-Poly1305 before sync.
            </div>
          </div>
          {user && (
            <div className="q-side-user">
              <div className="q-avatar">{initials}</div>
              <div className="q-side-user-meta">
                <span className="q-side-user-name">{user.user_metadata?.full_name || 'You'}</span>
                <span className="q-side-user-mail">{user.email}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Topbar({
  pathname,
  onMenuClick,
  onAdd,
}: {
  pathname: string;
  onMenuClick: () => void;
  onAdd: () => void;
}) {
  const title = PAGE_TITLES[pathname] ?? 'Overview';

  return (
    <div className="q-topbar">
      {/* Mobile hamburger — hidden on desktop, visible via CSS on mobile */}
      <button
        className="q-icon-btn q-topbar-menu-btn"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu size={16} />
      </button>

      {/* Breadcrumb */}
      <div className="q-topbar-crumbs">
        <span>Personal</span>
        <span className="q-topbar-crumb-sep">›</span>
        <span className="q-topbar-crumb-active">{title}</span>
      </div>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 320 }}>
        <div className="q-input" style={{ height: 32 }}>
          <span className="q-input-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input placeholder="Search sources, snapshots…" />
        </div>
      </div>

      {/* Actions */}
      <SyncIndicator />

      <button
        className="q-btn q-btn--primary q-btn--sm"
        onClick={onAdd}
        aria-label="Add measurement"
      >
        <Plus size={14} />
        <span>Add measurement</span>
      </button>

      <AuthButton />
    </div>
  );
}

export function AppShell({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="q-app">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="q-main">
        <Topbar
          pathname={pathname}
          onMenuClick={() => setSidebarOpen(true)}
          onAdd={() => setAddOpen(true)}
        />
        <div className="q-content q-screen">
          {children}
        </div>
      </div>

      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
