import {
  Badge,
  Card,
  DescriptionList,
  ICON_SIZE,
  TriangleAlert,
} from '@admin/components/ui';
import {
  CANCELLATION_FLOWS,
  OUTCOME_ROWS,
  type Outcome,
  type OutcomeTone,
} from '@admin/features/cancellation-flows/flows';

const TONE_BADGE: Record<OutcomeTone, { tone: 'success' | 'danger' | 'warning' | 'neutral'; label: string }> = {
  ok: { tone: 'success', label: 'Kept whole' },
  lost: { tone: 'danger', label: 'Lost' },
  warn: { tone: 'warning', label: 'Misleading' },
  none: { tone: 'neutral', label: 'Nothing at stake' },
};

function OutcomeValue({ outcome }: { outcome: Outcome }) {
  const badge = TONE_BADGE[outcome.tone];
  return (
    <span className="flows-outcome">
      <Badge tone={badge.tone}>{badge.label}</Badge>
      <span>{outcome.text}</span>
    </span>
  );
}

/**
 * Every way a booking can be cancelled, and what each does to the mother's
 * credits, promo code, money and notifications — open without an account.
 *
 * Public for the same reason as /qa: the people deciding the cancellation
 * policy include the business team, who have no console login. So it renders
 * outside RequireAuth and AdminLayout, with its own header, and reads nothing
 * from the API.
 */
export function CancellationFlowsPage() {
  const gaps = CANCELLATION_FLOWS.filter((flow) => flow.gap !== undefined);

  return (
    <div className="qa-page">
      <div className="qa-shell">
        <header className="qa-header">
          <div>
            <h1 className="admin-logo">
              NannyNow <span>Cancellation flows</span>
            </h1>
            <p className="qa-subtitle">
              Every way a booking can be cancelled today, and what happens to the mother&rsquo;s
              prepaid package hours, Care Points, promo code and money in each. &ldquo;The
              window&rdquo; is the cancellation window set under Booking options &rarr; Notice
              &amp; cancellation.
            </p>
          </div>
        </header>

        <div className="flows-legend" aria-label="Legend">
          {Object.values(TONE_BADGE).map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>
              {badge.label}
            </Badge>
          ))}
        </div>

        <Card title={`Known gaps (${gaps.length})`}>
          <ul className="flows-gap-list">
            {gaps.map((flow) => (
              <li key={flow.id}>
                <a href={`#${flow.id}`}>{flow.title}</a> — {flow.gap}
              </li>
            ))}
          </ul>
        </Card>

        {CANCELLATION_FLOWS.map((flow, index) => (
          <section key={flow.id} id={flow.id} className="flows-flow" aria-label={flow.title}>
            <Card title={`${index + 1}. ${flow.title}`}>
              <div className="flows-meta">
                <Badge>{flow.who}</Badge>
                <span className="flows-when">{flow.when}</span>
              </div>
              <DescriptionList
                items={OUTCOME_ROWS.map((row) => ({
                  label: row.label,
                  value: <OutcomeValue outcome={flow[row.key]} />,
                }))}
              />
              {flow.gap && (
                <p className="flows-gap">
                  <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
                  <span>{flow.gap}</span>
                </p>
              )}
              <p className="flows-source">{flow.source}</p>
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
