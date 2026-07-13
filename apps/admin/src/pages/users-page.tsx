import { useState } from 'react';

import { PageHeader } from '@admin/components/ui';
import { NannyReviewTab } from '@admin/features/nannies/nanny-review-tab';
import { MothersTab } from '@admin/features/users/mothers-tab';

const TABS = [
  { id: 'mommies', label: 'Mommies' },
  { id: 'nannies', label: 'Nannies' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function UsersPage() {
  const [tab, setTab] = useState<TabId>('mommies');

  return (
    <section>
      <PageHeader
        title="Users"
        subtitle="Everyone on the platform — browse the parents who’ve signed up and review new nanny registrations."
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
      </div>
    </section>
  );
}
