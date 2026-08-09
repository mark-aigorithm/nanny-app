import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import type {
  AdminRole,
  AdminSection,
  AdminUser,
  OperatorPermissions,
  RequiredAccessLevel,
} from '@nanny-app/shared';
import { firstPermittedPath, hasSectionAccess } from '@nanny-app/shared';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { fetchAdminMe } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

// ──────────────────────────────────────────────────────────────
// Console privileges — the single global source for the whole app
// ──────────────────────────────────────────────────────────────
// One `/admin/me` fetch decides what the sidebar lists, which routes resolve,
// and which write actions render. `can()` delegates to the shared
// `hasSectionAccess`, the same function the API enforces with — so the UI can
// never disagree with the server about what an operator may do.
// ──────────────────────────────────────────────────────────────

type PermissionsState = {
  me: AdminUser;
  role: AdminRole;
  permissions: OperatorPermissions;
  /** True when the signed-in account holds `level` on `section`. */
  can: (section: AdminSection, level: RequiredAccessLevel) => boolean;
  /** Where this account should land — null when it holds nothing at all. */
  landingPath: string | null;
};

const PermissionsContext = createContext<PermissionsState | null>(null);

/**
 * Owns the `admin-me` query. Mounted inside `RequireAuth` so it only runs for a
 * signed-in session, and blocks its children until privileges are known — a
 * page must never render with a "no access" assumption it then reverses.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-me'],
    queryFn: fetchAdminMe,
  });

  const value = useMemo<PermissionsState | null>(() => {
    if (!me) return null;
    return {
      me,
      role: me.role,
      permissions: me.permissions,
      can: (section, level) => hasSectionAccess(me.role, me.permissions, section, level),
      landingPath: firstPermittedPath(me.role, me.permissions),
    };
  }, [me]);

  if (isLoading || (!me && error == null)) {
    return <LoadingState label="Loading your console…" />;
  }
  if (!value) {
    return (
      <ErrorState
        title="We couldn’t load your account"
        message={apiErrorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsState {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within PermissionsProvider');
  }
  return ctx;
}

/**
 * "May I write to this section?" — the check every create form and row-action
 * menu makes. A view-only operator still sees the page; the controls that would
 * change something simply aren't offered.
 */
export function useCanManage(section: AdminSection): boolean {
  return usePermissions().can(section, 'MANAGE');
}

/**
 * Route guard. Sends an account that lacks the section to wherever it *can*
 * go, so a bookmarked or hand-typed URL never dead-ends on an empty page.
 */
export function RequireSection({
  section,
  level = 'VIEW',
  children,
}: {
  section: AdminSection;
  level?: RequiredAccessLevel;
  children: ReactNode;
}) {
  const { can, landingPath } = usePermissions();

  if (can(section, level)) return children;
  if (landingPath === null) return <NoAccess />;
  return <Navigate to={landingPath} replace />;
}

/** Shown to an account with no sections at all — nowhere to redirect it to. */
export function NoAccess() {
  return (
    <ErrorState
      title="No access yet"
      message="Your account hasn’t been given access to any part of the console. Ask an administrator to grant you a section."
    />
  );
}
