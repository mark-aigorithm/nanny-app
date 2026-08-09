import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState, PageHeader, StaleRefreshBanner, TableSkeleton } from '@admin/components/ui';
import { PackageForm } from '@admin/features/packages/package-form';
import { PackageTable } from '@admin/features/packages/package-table';
import { PurchasesTab } from '@admin/features/package-purchases/purchases-tab';
import { fetchPackages } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

const TABS = [
  { id: 'packages', label: 'Packages' },
  { id: 'purchases', label: 'Purchases' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function PackagesPage() {
  const canManage = useCanManage('packages');
  const [tab, setTab] = useState<TabId>('packages');
  const { data: packages, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['packages'],
    queryFn: fetchPackages,
  });

  return (
    <section>
      <PageHeader
        title="Packages"
        subtitle="Curate the purchasable hour bundles offered to parents and review every prepaid purchase behind them."
      />

      <div className="subtabs" role="tablist" aria-label="Package sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`subtab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="subtab-panel">
        {tab === 'packages' && (
          <>
            {canManage && <PackageForm />}
            {isLoading && <TableSkeleton columns={6} />}
            {error != null && !packages && (
              <ErrorState
                message={apiErrorMessage(error)}
                onRetry={() => void refetch()}
                retrying={isFetching}
              />
            )}
            {packages && (
              <>
                {error != null && (
                  <StaleRefreshBanner
                    message={apiErrorMessage(error)}
                    onRetry={() => void refetch()}
                    retrying={isFetching}
                  />
                )}
                <PackageTable packages={packages} />
              </>
            )}
          </>
        )}
        {tab === 'purchases' && <PurchasesTab />}
      </div>
    </section>
  );
}
