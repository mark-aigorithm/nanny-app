import { useState } from 'react';

import { PageHeader } from '@admin/components/ui';
import { BaseSplitPanel } from '@admin/features/pricing/base-split-panel';
import { CalculatorPanel } from '@admin/features/pricing/calculator-panel';
import { DurationRulesPanel } from '@admin/features/pricing/duration-rules-panel';
import { SkillFeesPanel } from '@admin/features/pricing/skill-fees-panel';

const TABS = [
  { id: 'base', label: 'Base & Split' },
  { id: 'skills', label: 'Skill Fees' },
  { id: 'duration', label: 'Duration Tiers' },
  { id: 'calculator', label: 'Calculator' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function PricingFeesPage() {
  const [tab, setTab] = useState<TabId>('base');

  return (
    <section>
      <PageHeader
        title="Pricing & Fees"
        subtitle="Set the base rate, per-skill add-ons, duration discounts and the nanny/platform split — then test any booking in the calculator."
      />

      <div className="subtabs" role="tablist" aria-label="Pricing sections">
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
        {tab === 'base' && <BaseSplitPanel />}
        {tab === 'skills' && <SkillFeesPanel />}
        {tab === 'duration' && <DurationRulesPanel />}
        {tab === 'calculator' && <CalculatorPanel />}
      </div>
    </section>
  );
}
