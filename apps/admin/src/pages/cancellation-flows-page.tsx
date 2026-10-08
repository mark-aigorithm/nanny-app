import { isAxiosError } from 'axios';

import { CANCELLATION_DECISIONS, CANCELLATION_EXAMPLE_BOOKING } from '@nanny-app/shared';

import { Badge, Card, ICON_SIZE, Info, TriangleAlert, useToast } from '@admin/components/ui';
import { DecisionCard, type RecordingState } from '@admin/features/cancellation-flows/decision-card';
import { CANCELLATION_FLOWS } from '@admin/features/cancellation-flows/flows';
import { TONE_BADGE } from '@admin/features/cancellation-flows/outcome-value';
import { FlowsTable } from '@admin/features/cancellation-flows/flows-table';
import {
  useCancellationDecisions,
  useClearCancellationDecision,
  useSetCancellationDecision,
} from '@admin/features/cancellation-flows/use-cancellation-decisions';
import { apiErrorMessage } from '@admin/lib/api-error';

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
  const toast = useToast();
  const gaps = CANCELLATION_FLOWS.filter((flow) => flow.gap !== undefined);

  const decisions = useCancellationDecisions();
  const setDecision = useSetCancellationDecision();
  const clearDecision = useClearCancellationDecision();

  // The page reads fine without the backend; recording just switches off. A
  // 404 means the server has the board turned off, anything else is a fault.
  const recording: RecordingState = decisions.isLoading
    ? 'loading'
    : decisions.isSuccess
      ? 'on'
      : 'off';
  const recordingDisabled =
    isAxiosError(decisions.error) && decisions.error.response?.status === 404;
  const entries = decisions.data?.entries ?? {};
  const decidedCount = CANCELLATION_DECISIONS.filter((d) => entries[d.id] !== undefined).length;
  const busyDecisionId = setDecision.isPending
    ? setDecision.variables.decisionId
    : clearDecision.isPending
      ? clearDecision.variables
      : null;

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
          <a href="#today">What happens today</a>
          <a href="#gaps">Known gaps ({gaps.length})</a>
          <a href="#decisions">Decisions to make ({CANCELLATION_DECISIONS.length})</a>
        </nav>

        <div className="flows-legend" aria-label="Legend">
          {Object.values(TONE_BADGE).map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>
              {badge.label}
            </Badge>
          ))}
        </div>

        <h2 id="today" className="flows-section-title">
          What happens today
        </h2>
        <p className="flows-section-lead">
          One row per way a booking can be cancelled. Pick how it was paid to see exactly what
          the mother keeps or loses. A promo code can sit on top of any payment: it comes off
          first, then package hours, then Care Points, and the card pays the rest.
        </p>
        <p className="flows-design-note">
          <Info size={ICON_SIZE.inline} aria-hidden />
          <span>
            <strong>Nannies can&rsquo;t cancel bookings.</strong> This is by design: a nanny who
            can&rsquo;t make a booking contacts support, and an admin handles it.
          </span>
        </p>
        <FlowsTable />

        <section id="gaps" className="flows-flow" aria-label="Known gaps">
          <Card title={`Known gaps (${gaps.length})`}>
            {gaps.length === 0 ? (
              <p className="flows-section-lead">
                None — every flow above works as designed. What is still open is in the decisions
                below.
              </p>
            ) : (
              <ul className="flows-gap-list">
                {gaps.map((flow) => (
                  <li key={flow.id}>
                    <a href={`#${flow.id}`}>{flow.title}</a> — {flow.gap}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>


        <h2 id="decisions" className="flows-section-title">
          Decisions to make
        </h2>
        <p className="flows-section-lead">
          Each question lists the options with what they mean for the mother and the business.
          &ldquo;Today&rdquo; is what the app does now; &ldquo;Proposed&rdquo; is the direction
          suggested so far. Pick an option and record it — everyone with this link sees the same
          answers. {CANCELLATION_EXAMPLE_BOOKING.summary} {CANCELLATION_EXAMPLE_BOOKING.note}
        </p>
        {recording === 'on' && (
          <p className="flows-progress" role="status">
            <strong>
              {decidedCount} of {CANCELLATION_DECISIONS.length}
            </strong>{' '}
            decisions recorded
          </p>
        )}
        {recording === 'off' && (
          <p className="flows-gap" role="status">
            <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
            <span>
              {recordingDisabled
                ? 'Recording answers is switched off on this server, so the options below are read-only.'
                : `Recorded answers could not be loaded: ${apiErrorMessage(decisions.error)}`}
            </span>
          </p>
        )}
        {CANCELLATION_DECISIONS.map((decision, index) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            number={index + 1}
            entry={entries[decision.id]}
            recording={recording}
            saving={busyDecisionId === decision.id}
            onSave={(input) =>
              setDecision.mutate(
                { decisionId: decision.id, input },
                {
                  onSuccess: () => toast.success('Decision recorded', decision.title),
                  onError: (err) =>
                    toast.error('Could not record the decision', apiErrorMessage(err)),
                },
              )
            }
            onClear={() =>
              clearDecision.mutate(decision.id, {
                onSuccess: () => toast.success('Decision re-opened', decision.title),
                onError: (err) => toast.error('Could not re-open the decision', apiErrorMessage(err)),
              })
            }
          />
        ))}

      </div>
    </div>
  );
}
