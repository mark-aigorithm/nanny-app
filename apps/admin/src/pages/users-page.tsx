import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@admin/components/ui';
import { IdReviewTab } from '@admin/features/id-reviews/id-review-tab';
import { NannyReviewTab } from '@admin/features/nannies/nanny-review-tab';
import { MothersTab } from '@admin/features/users/mothers-tab';

const TABS = [
  { id: 'mommies', label: 'Mommies' },
  { id: 'nannies', label: 'Nannies' },
  { id: 'idReview', label: 'ID Review' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

/**
 * The open tab lives in the URL (`/users?tab=nannies`), so a detail page's back
 * link, a refresh or a shared link returns to the same tab.
 */
export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: TabId = isTabId(requested) ? requested : 'mommies';
  // Replace, not push: flipping tabs shouldn't pile up Back-button steps.
  const setTab = (next: TabId) => setSearchParams({ tab: next }, { replace: true });

  return (
    <section>
      <PageHeader
        title="Users"
        subtitle="Everyone on the platform — browse parents, verify their IDs, and review new nanny applications."
      />

      <div className="subtabs" role="tablist" aria-label="User types">
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
        {tab === 'mommies' && <MothersTab />}
        {tab === 'nannies' && <NannyReviewTab />}
        {tab === 'idReview' && <IdReviewTab />}
      </div>
    </section>
  );
}
