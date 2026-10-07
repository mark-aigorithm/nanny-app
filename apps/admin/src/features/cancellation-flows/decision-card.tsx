import { Badge, Card } from '@admin/components/ui';

import type { Decision, OptionStatus } from './decisions';

const STATUS_BADGE: Record<OptionStatus, { tone: 'neutral' | 'success'; label: string }> = {
  today: { tone: 'neutral', label: 'Today' },
  proposed: { tone: 'success', label: 'Proposed' },
};

/** One policy question with its options side by side. */
export function DecisionCard({ decision, number }: { decision: Decision; number: number }) {
  return (
    <section id={decision.id} className="flows-flow" aria-label={decision.title}>
      <Card title={`D${number}. ${decision.title}`}>
        <p className="flows-question">{decision.question}</p>
        <p className="flows-context">{decision.context}</p>
        <div className="flows-options">
          {decision.options.map((option) => (
            <article
              key={option.label}
              className={`flows-option${option.status === 'proposed' ? ' flows-option--proposed' : ''}`}
              aria-label={option.label}
            >
              <header className="flows-option-head">
                <h4>{option.label}</h4>
                {option.status && (
                  <Badge tone={STATUS_BADGE[option.status].tone}>
                    {STATUS_BADGE[option.status].label}
                  </Badge>
                )}
              </header>
              <p>{option.description}</p>
              <dl className="flows-option-facts">
                <dt>Mother</dt>
                <dd>{option.mother}</dd>
                <dt>Business</dt>
                <dd>{option.business}</dd>
                {option.example && (
                  <>
                    <dt>Example</dt>
                    <dd>{option.example}</dd>
                  </>
                )}
              </dl>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
