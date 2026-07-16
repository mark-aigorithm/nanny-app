import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { fetchAdminMe } from '../lib/api';
import { useAuth } from '../lib/auth';
import { NotificationBell } from './notification-bell';
import {
  CalendarClock,
  ChevronsUpDown,
  Gift,
  ICON_SIZE,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  MenuIcon,
  MenuItem,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  Video,
  Wallet,
} from './ui';

type NavItem = { to: string; label: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bookings', label: 'Bookings', icon: CalendarClock },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/promo-codes', label: 'Promo Codes', icon: Ticket },
  { to: '/skills', label: 'Nanny Skills', icon: Sparkles },
  { to: '/rewards', label: 'Care Points', icon: Gift },
  { to: '/pricing', label: 'Pricing & Fees', icon: Wallet },
  { to: '/cameras', label: 'Cameras', icon: Video },
  { to: '/settings', label: 'Booking Options', icon: Settings },
];

const COLLAPSE_KEY = 'admin-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function initials(value: string): string {
  return value.trim().charAt(0).toUpperCase() || '?';
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { data: me } = useQuery({ queryKey: ['admin-me'], queryFn: fetchAdminMe });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const links: NavItem[] = [
    ...navItems,
    ...(me?.role === 'SUPERUSER'
      ? [{ to: '/admins', label: 'Admins', icon: ShieldCheck } as NavItem]
      : []),
  ];

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer; lock body scroll while it's open.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('drawer-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('drawer-open');
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  }

  return (
    <div className="admin-layout">
      {mobileOpen && (
        <div className="sidebar-backdrop" role="presentation" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`admin-sidebar${collapsed ? ' admin-sidebar--collapsed' : ''}${
          mobileOpen ? ' admin-sidebar--open' : ''
        }`}
      >
        <div className="admin-sidebar-head">
          <h1 className="admin-logo">
            NannyNow <span>Admin</span>
          </h1>
          <button
            type="button"
            className="sidebar-collapse-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={ICON_SIZE.nav} />
            ) : (
              <PanelLeftClose size={ICON_SIZE.nav} />
            )}
          </button>
        </div>
        <nav>
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={ICON_SIZE.nav} />
                <span className="admin-nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        {user?.email && (
          <Menu
            className="admin-user"
            triggerClassName="admin-user-trigger"
            triggerLabel="Account menu"
            placement="top-start"
            trigger={
              <>
                <span className="admin-user-avatar" aria-hidden>
                  {initials(user.email)}
                </span>
                <span className="admin-user-meta">
                  <span className="admin-user-label">Signed in</span>
                  <span className="admin-user-email">{user.email}</span>
                </span>
                <ChevronsUpDown size={16} className="admin-user-caret" aria-hidden />
              </>
            }
          >
            <MenuItem icon={<LogOut size={ICON_SIZE.menu} />} onSelect={() => void logout()}>
              Sign out
            </MenuItem>
          </Menu>
        )}
      </aside>
      <main className="admin-content">
        <header className="admin-topbar">
          <button
            type="button"
            className="topbar-hamburger"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon size={ICON_SIZE.nav} />
          </button>
          <NotificationBell />
        </header>
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
