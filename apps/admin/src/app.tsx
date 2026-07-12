import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './components/admin-layout';
import { AuthProvider, RequireAuth } from './lib/auth';
import { AdminsPage } from './pages/admins-page';
import { CamerasPage } from './pages/cameras-page';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { NanniesPage } from './pages/nannies-page';
import { BookingsPage } from './pages/bookings-page';
import { PricingFeesPage } from './pages/pricing-fees-page';
import { PromoCodesPage } from './pages/promo-codes-page';
import { SettingsPage } from './pages/settings-page';
import { SkillsPage } from './pages/skills-page';

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
              <Route path="nannies" element={<NanniesPage />} />
              <Route path="admins" element={<AdminsPage />} />
              <Route path="promo-codes" element={<PromoCodesPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="pricing" element={<PricingFeesPage />} />
              <Route path="cameras" element={<CamerasPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
