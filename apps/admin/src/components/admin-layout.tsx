import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';

import { fetchAdminMe } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button } from './ui';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/nannies', label: 'New Nannies' },
  { to: '/promo-codes', label: 'Promo Codes' },
  { to: '/settings', label: 'Configuration' },
] as const;

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { data: me } = useQuery({ queryKey: ['admin-me'], queryFn: fetchAdminMe });
  const links = [
    ...navItems,
    ...(me?.role === 'SUPERUSER' ? [{ to: '/admins', label: 'Admins' } as const] : []),
  ];
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h1 className="admin-logo">
          NannyNow <span>Admin</span>
        </h1>
        <nav>
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {user?.email && <p className="admin-user-email">{user.email}</p>}
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
