import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './components/admin-layout';
import { ToastProvider } from './components/ui';
import { AuthProvider, RequireAuth } from './lib/auth';
import { AdminsPage } from './pages/admins-page';
import { CamerasPage } from './pages/cameras-page';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { UsersPage } from './pages/users-page';
import { MotherDetailPage } from './pages/mother-detail-page';
import { NannyDetailPage } from './pages/nanny-detail-page';
import { BookingsPage } from './pages/bookings-page';
import { BookingDetailPage } from './pages/booking-detail-page';
import { PricingFeesPage } from './pages/pricing-fees-page';
import { PromoCodesPage } from './pages/promo-codes-page';
import { RewardsPage } from './pages/rewards-page';
import { SettingsPage } from './pages/settings-page';
import { SkillsPage } from './pages/skills-page';
import { CertificationsPage } from './pages/certifications-page';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="bookings/:id" element={<BookingDetailPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/mothers/:id" element={<MotherDetailPage />} />
              <Route path="users/nannies/:id" element={<NannyDetailPage />} />
              {/* Legacy path — the Nannies page is now a tab under Users. */}
              <Route path="nannies" element={<Navigate to="/users" replace />} />
              <Route path="admins" element={<AdminsPage />} />
              <Route path="promo-codes" element={<PromoCodesPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="certifications" element={<CertificationsPage />} />
              <Route path="rewards" element={<RewardsPage />} />
              <Route path="pricing" element={<PricingFeesPage />} />
              <Route path="cameras" element={<CamerasPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
