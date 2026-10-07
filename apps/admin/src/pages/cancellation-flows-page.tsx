import { Badge, Card, DescriptionList, ICON_SIZE, TriangleAlert } from '@admin/components/ui';
import { DecisionCard } from '@admin/features/cancellation-flows/decision-card';
import { DECISIONS, EXAMPLE_BOOKING } from '@admin/features/cancellation-flows/decisions';
import { CANCELLATION_FLOWS, OUTCOME_ROWS } from '@admin/features/cancellation-flows/flows';
import { OutcomeValue, TONE_BADGE } from '@admin/features/cancellation-flows/outcome-value';
import { PaymentMatrixTable } from '@admin/features/cancellation-flows/payment-matrix-table';

/**
 * Every way a booking can be cancelled, what each does to the mother's
 * credits, promo code and money today, and the policy options for each — open
 * without an account.
 *
 * Public for the same reason as /qa: the cancellation policy is decided with
 * the business team, who have no console login. So it renders outside
 * RequireAuth and AdminLayout, with its own header, and reads nothing from the
 * API.
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
              What happens to the mother&rsquo;s prepaid package hours, Care Points, promo code and
              money for every way a booking can be paid for and cancelled — today, and under each
              policy option on the table. &ldquo;The window&rdquo; is the cancellation window set
              under Booking options &rarr; Notice &amp; cancellation.
            </p>
          </div>
        </header>

        <nav className="flows-jump" aria-label="On this page">
          <a href="#by-payment">By payment method</a>
          <a href="#decisions">Decisions to make ({DECISIONS.length})</a>
          <a href="#gaps">Known gaps ({gaps.length})</a>
          <a href="#flows">Every flow today ({CANCELLATION_FLOWS.length})</a>
        </nav>

        <div className="flows-legend" aria-label="Legend">
          {Object.values(TONE_BADGE).map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>
              {badge.label}
            </Badge>
          ))}
        </div>

        <h2 id="by-payment" className="flows-section-title">
          By payment method — today
        </h2>
        <PaymentMatrixTable />

        <h2 id="decisions" className="flows-section-title">
          Decisions to make
        </h2>
        <p className="flows-section-lead">
          Each question lists the options with what they mean for the mother and the business.
          &ldquo;Today&rdquo; is what the app does now; &ldquo;Proposed&rdquo; is the direction
          suggested so far. {EXAMPLE_BOOKING.summary} {EXAMPLE_BOOKING.note}
        </p>
        {DECISIONS.map((decision, index) => (
          <DecisionCard key={decision.id} decision={decision} number={index + 1} />
        ))}

        <section id="gaps" className="flows-flow" aria-label="Known gaps">
          <Card title={`Known gaps (${gaps.length})`}>
            <ul className="flows-gap-list">
              {gaps.map((flow) => (
                <li key={flow.id}>
                  <a href={`#${flow.id}`}>{flow.title}</a> — {flow.gap}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <h2 id="flows" className="flows-section-title">
          Every flow today
        </h2>
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
