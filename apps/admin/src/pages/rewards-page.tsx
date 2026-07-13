import { useState } from 'react';

import { PageHeader } from '@admin/components/ui';
import { RewardWalletsTab } from '@admin/features/rewards/reward-wallets-tab';
import { RewardsConfigPanel } from '@admin/features/rewards/rewards-config-panel';

const TABS = [
  { id: 'config', label: 'Configuration' },
  { id: 'wallets', label: 'User Wallets' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function RewardsPage() {
  const [tab, setTab] = useState<TabId>('config');

  return (
    <section>
      <PageHeader
        title="Care Points"
        subtitle="Reward parents for booking. Set the earn/redeem rates, and browse or adjust any parent’s points wallet."
      />

      <div className="subtabs" role="tablist" aria-label="Care Points sections">
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
        {tab === 'config' && <RewardsConfigPanel />}
        {tab === 'wallets' && <RewardWalletsTab />}
      </div>
    </section>
  );
}
