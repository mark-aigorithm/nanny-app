import { Badge } from '@admin/components/ui';

import type { Outcome, OutcomeTone } from './flows';

export const TONE_BADGE: Record<
  OutcomeTone,
  { tone: 'success' | 'danger' | 'warning' | 'neutral'; label: string }
> = {
  ok: { tone: 'success', label: 'Kept whole' },
  lost: { tone: 'danger', label: 'Lost' },
  warn: { tone: 'warning', label: 'Misleading' },
  none: { tone: 'neutral', label: 'Nothing at stake' },
};

export function OutcomeValue({ outcome }: { outcome: Outcome }) {
  const badge = TONE_BADGE[outcome.tone];
  return (
    <span className="flows-outcome">
      <Badge tone={badge.tone}>{badge.label}</Badge>
      <span>{outcome.text}</span>
    </span>
  );
}
