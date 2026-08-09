import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import type { AdminSection } from '@nanny-app/shared';

import { AdminLayout } from './components/admin-layout';
import { ToastProvider } from './components/ui';
import { AuthProvider, RequireAuth } from './lib/auth';
import {
  NoAccess,
  PermissionsProvider,
  RequireSection,
  usePermissions,
} from './lib/permissions';
import { AdminsPage } from './pages/admins-page';
import { CamerasPage } from './pages/cameras-page';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { MarketplacePage } from './pages/marketplace-page';
import { UsersPage } from './pages/users-page';
import { MotherDetailPage } from './pages/mother-detail-page';
import { NannyDetailPage } from './pages/nanny-detail-page';
import { BookingsPage } from './pages/bookings-page';
import { BookingDetailPage } from './pages/booking-detail-page';
import { PricingFeesPage } from './pages/pricing-fees-page';
import { PromoCodesPage } from './pages/promo-codes-page';
import { CampaignsPage } from './pages/campaigns-page';
import { RewardsPage } from './pages/rewards-page';
import { SettingsPage } from './pages/settings-page';
import { SkillsPage } from './pages/skills-page';
import { CertificationsPage } from './pages/certifications-page';
import { PackagesPage } from './pages/packages-page';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/** Wraps a page in the privilege its section requires. */
function Guarded({ section, children }: { section: AdminSection; children: React.ReactNode }) {
  return <RequireSection section={section}>{children}</RequireSection>;
}

/** Superuser-only route — operators and admins get bounced to their landing page. */
function SuperuserOnly({ children }: { children: React.ReactNode }) {
  const { role, landingPath } = usePermissions();
  if (role === 'SUPERUSER') return children;
  return landingPath === null ? <NoAccess /> : <Navigate to={landingPath} replace />;
}

/** Anything unrecognised goes to the first page this account may open. */
function LandingRedirect() {
  const { landingPath } = usePermissions();
  return landingPath === null ? <NoAccess /> : <Navigate to={landingPath} replace />;
}

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
                  <PermissionsProvider>
                    <AdminLayout />
                  </PermissionsProvider>
                </RequireAuth>
              }
            >
              <Route
                index
                element={
                  <Guarded section="dashboard">
                    <DashboardPage />
                  </Guarded>
                }
              />
              <Route
                path="bookings"
                element={
                  <Guarded section="bookings">
                    <BookingsPage />
                  </Guarded>
                }
              />
              <Route
                path="bookings/:id"
                element={
                  <Guarded section="bookings">
                    <BookingDetailPage />
                  </Guarded>
                }
              />
              <Route
                path="users"
                element={
                  <Guarded section="users">
                    <UsersPage />
                  </Guarded>
                }
              />
              <Route
                path="users/mothers/:id"
                element={
                  <Guarded section="users">
                    <MotherDetailPage />
                  </Guarded>
                }
              />
              <Route
                path="users/nannies/:id"
                element={
                  <Guarded section="users">
                    <NannyDetailPage />
                  </Guarded>
                }
              />
              {/* Legacy path — the Nannies page is now a tab under Users. */}
              <Route path="nannies" element={<Navigate to="/users" replace />} />
              <Route
                path="admins"
                element={
                  <SuperuserOnly>
                    <AdminsPage />
                  </SuperuserOnly>
                }
              />
              <Route
                path="promo-codes"
                element={
                  <Guarded section="promoCodes">
                    <PromoCodesPage />
                  </Guarded>
                }
              />
              <Route
                path="campaigns"
                element={
                  <Guarded section="campaigns">
                    <CampaignsPage />
                  </Guarded>
                }
              />
              <Route
                path="marketplace"
                element={
                  <Guarded section="marketplace">
                    <MarketplacePage />
                  </Guarded>
                }
              />
              <Route
                path="skills"
                element={
                  <Guarded section="skills">
                    <SkillsPage />
                  </Guarded>
                }
              />
              <Route
                path="certifications"
                element={
                  <Guarded section="certifications">
                    <CertificationsPage />
                  </Guarded>
                }
              />
              <Route
                path="packages"
                element={
                  <Guarded section="packages">
                    <PackagesPage />
                  </Guarded>
                }
              />
              <Route
                path="rewards"
                element={
                  <Guarded section="rewards">
                    <RewardsPage />
                  </Guarded>
                }
              />
              <Route
                path="pricing"
                element={
                  <Guarded section="pricing">
                    <PricingFeesPage />
                  </Guarded>
                }
              />
              <Route
                path="cameras"
                element={
                  <Guarded section="cameras">
                    <CamerasPage />
                  </Guarded>
                }
              />
              <Route
                path="settings"
                element={
                  <Guarded section="settings">
                    <SettingsPage />
                  </Guarded>
                }
              />
              <Route path="*" element={<LandingRedirect />} />
            </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
