import { useState } from 'react';

import { isAxiosError } from 'axios';

import { cancellationCellKey } from '@nanny-app/shared';

import { Badge, Card, ICON_SIZE, Info, TriangleAlert } from '@admin/components/ui';
import { CellEditor } from '@admin/features/cancellation-flows/cell-editor';
import { CANCELLATION_FLOWS, OUTCOME_ROWS } from '@admin/features/cancellation-flows/flows';
import { TONE_BADGE } from '@admin/features/cancellation-flows/outcome-value';
import { FlowsTable } from '@admin/features/cancellation-flows/flows-table';
import { useCellProposals, type CellRef } from '@admin/features/cancellation-flows/use-cell-proposals';
import { apiErrorMessage } from '@admin/lib/api-error';

/**
 * Every way a booking can be cancelled and what each does to the mother's
 * credits, promo code and money today, with the changes the business team
 * proposes, cell by cell — open without an account.
 *
 * Public for the same reason as /qa: the cancellation policy is decided with
 * the business team, who have no console login. So it renders outside
 * RequireAuth and AdminLayout, with its own header, and reads nothing from the
 * API but the proposed changes.
 */
export function CancellationFlowsPage() {
  const gaps = CANCELLATION_FLOWS.filter((flow) => flow.gap !== undefined);

  const cellProposals = useCellProposals();
  const [editing, setEditing] = useState<CellRef | null>(null);
  // Whoever saved last from this page, so the next cell's "Your name" is filled in.
  const [lastName, setLastName] = useState('');
  const proposals = cellProposals.data?.entries ?? {};
  const cellsOff = cellProposals.isError;
  const cellsDisabled =
    isAxiosError(cellProposals.error) && cellProposals.error.response?.status === 404;
  const editingFlow = editing && CANCELLATION_FLOWS.find((flow) => flow.id === editing.flowId);
  const editingColumn = editing && OUTCOME_ROWS.find((row) => row.key === editing.outcome);

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
              money for every way a booking can be paid for and cancelled, and the changes proposed
              to each. &ldquo;The window&rdquo; is the cancellation window set under Booking
              options &rarr; Notice &amp; cancellation.
            </p>
          </div>
        </header>

        <nav className="flows-jump" aria-label="On this page">
          <a href="#today">What happens today</a>
          <a href="#gaps">Known gaps ({gaps.length})</a>
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
        <p className="flows-section-lead">
          <strong>Want something to work differently?</strong> Press <em>Change</em> in any cell
          and say what should happen instead — returned, refunded, a percentage, Care Points, or
          your own words. Your change shows in the cell with today&rsquo;s behaviour crossed out
          beneath it, and everyone with this link sees it. A change applies to the scenario
          whatever the payment.
        </p>
        {cellsOff && (
          <p className="flows-gap" role="alert">
            <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
            <span>
              {cellsDisabled
                ? 'Saving changes is switched off on this server, so the table is read-only.'
                : `Proposed changes could not be loaded: ${apiErrorMessage(cellProposals.error)}`}
            </span>
          </p>
        )}
        <p className="flows-design-note">
          <Info size={ICON_SIZE.inline} aria-hidden />
          <span>
            <strong>Nannies can&rsquo;t cancel bookings.</strong> This is by design: a nanny who
            can&rsquo;t make a booking contacts support, and an admin handles it.
          </span>
        </p>
        <FlowsTable
          proposals={proposals}
          canEdit={cellProposals.isSuccess}
          onEditCell={setEditing}
        />
        {editing && editingFlow && editingColumn && (
          <CellEditor
            key={cancellationCellKey(editing.flowId, editing.outcome)}
            cell={editing}
            scenario={editingFlow.title}
            outcomeLabel={editingColumn.label}
            today={editingFlow[editing.outcome]}
            proposal={proposals[cancellationCellKey(editing.flowId, editing.outcome)]}
            defaultName={lastName}
            onSaved={(name) => {
              if (name) setLastName(name);
            }}
            onClose={() => setEditing(null)}
          />
        )}

        <section id="gaps" className="flows-flow" aria-label="Known gaps">
          <Card title={`Known gaps (${gaps.length})`}>
            {gaps.length === 0 ? (
              <p className="flows-section-lead">
                None — every flow above works as designed. To change how one works, propose it in
                its cell.
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
      </div>
    </div>
  );
}
