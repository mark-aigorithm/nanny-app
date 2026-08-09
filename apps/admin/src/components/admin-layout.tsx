import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import type { AdminSection } from '@nanny-app/shared';

import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/permissions';
import { NotificationBell } from './notification-bell';
import {
  BadgeCheck,
  CalendarClock,
  ChevronsUpDown,
  Gift,
  ICON_SIZE,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Megaphone,
  Menu,
  MenuIcon,
  MenuItem,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  Users,
  Video,
  Wallet,
} from './ui';

type NavItem = { to: string; label: string; icon: LucideIcon; section?: AdminSection };

// `section` is what the sidebar filters on — an operator only sees the entries
// they can open. The Admins link has no section: it's superuser-only.
const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { to: '/bookings', label: 'Bookings', icon: CalendarClock, section: 'bookings' },
  { to: '/users', label: 'Users', icon: Users, section: 'users' },
  { to: '/promo-codes', label: 'Promo Codes', icon: Ticket, section: 'promoCodes' },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, section: 'campaigns' },
  { to: '/marketplace', label: 'Marketplace', icon: Store, section: 'marketplace' },
  { to: '/skills', label: 'Nanny Skills', icon: Sparkles, section: 'skills' },
  { to: '/certifications', label: 'Certifications', icon: BadgeCheck, section: 'certifications' },
  { to: '/packages', label: 'Packages', icon: Package, section: 'packages' },
  { to: '/rewards', label: 'Care Points', icon: Gift, section: 'rewards' },
  { to: '/pricing', label: 'Pricing & Fees', icon: Wallet, section: 'pricing' },
  { to: '/cameras', label: 'Cameras', icon: Video, section: 'cameras' },
  { to: '/settings', label: 'Booking Options', icon: Settings, section: 'settings' },
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
  const { role, can } = usePermissions();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const links: NavItem[] = [
    ...navItems.filter((item) => item.section === undefined || can(item.section, 'VIEW')),
    ...(role === 'SUPERUSER'
      ? [{ to: '/admins', label: 'Team', icon: ShieldCheck } as NavItem]
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
            matchTriggerWidth
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
