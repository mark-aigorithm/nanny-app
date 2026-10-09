import { useMemo, useState } from 'react';

import {
  cancellationCellKey,
  findCancellationCellChoice,
  summarizeCellProposal,
  type CancellationCellProposal,
  type CancellationOutcomeKey,
} from '@nanny-app/shared';

import {
  Badge,
  Button,
  FilterSelect,
  ICON_SIZE,
  Info,
  Pencil,
  Switch,
  Table,
  TriangleAlert,
  type Column,
} from '@admin/components/ui';

import {
  CANCELLATION_FLOWS,
  OUTCOME_ROWS,
  type CancellationActor,
  type CancellationFlow,
  type Outcome,
} from './flows';
import { OutcomeValue } from './outcome-value';
import { PAYMENT_METHODS, outcomesFor } from './payment-methods';
import type { CellRef } from './use-cell-proposals';

const ANY = 'ANY';

const PHASE_LABEL: Record<CancellationFlow['phase'], string> = {
  before: 'Before payment',
  after: 'After payment',
  other: 'Any time',
};

const ACTORS: readonly CancellationActor[] = ['Mother', 'Mother or nanny', 'Admin', 'System'];

function formatProposedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A proposed change, with what happens today crossed out beneath it. */
function ProposedValue({
  outcome,
  proposal,
  today,
}: {
  outcome: CancellationOutcomeKey;
  proposal: CancellationCellProposal;
  today: Outcome;
}) {
  const choice = findCancellationCellChoice(outcome, proposal.choiceId);
  if (!choice) return <OutcomeValue outcome={today} />;
  return (
    <span className="flows-proposed">
      <Badge tone={choice.tone}>Proposed</Badge>
      <strong>{summarizeCellProposal(choice, proposal.percent)}</strong>
      {proposal.text && <span>{proposal.text}</span>}
      <span className="flows-proposed-meta">
        {proposal.proposedBy ? `by ${proposal.proposedBy} · ` : ''}
        {formatProposedAt(proposal.updatedAt)}
      </span>
      <span className="flows-proposed-today">
        <span className="flows-proposed-today-label">Today:</span> <del>{today.text}</del>
      </span>
    </span>
  );
}

type FlowsTableProps = {
  /** Proposed changes, keyed by cancellationCellKey. */
  proposals: Record<string, CancellationCellProposal>;
  /** Cells can be changed — recording is on. */
  canEdit: boolean;
  onEditCell: (cell: CellRef) => void;
};

/**
 * Every cancellation flow in one table, re-read for whichever payment method is
 * picked — the single view of what happens today, and of the changes the
 * business team proposes to it, cell by cell. Each row's gap, or why it can't
 * happen with the picked payment, sits in a full-width line beneath it.
 *
 * A cell the picked payment doesn't involve ("Not used.") shows that and can't
 * be changed: a proposal belongs to the scenario, whatever the payment.
 */
export function FlowsTable({ proposals, canEdit, onEditCell }: FlowsTableProps) {
  const [methodId, setMethodId] = useState<string>(ANY);
  const [who, setWho] = useState<string>(ANY);
  const [onlyChanged, setOnlyChanged] = useState(false);

  const method = PAYMENT_METHODS.find((m) => m.id === methodId);
  const changedCount = Object.keys(proposals).length;

  const rows = useMemo(
    () =>
      CANCELLATION_FLOWS.filter((flow) => who === ANY || flow.who === who)
        .filter(
          (flow) =>
            !onlyChanged ||
            OUTCOME_ROWS.some((o) => proposals[cancellationCellKey(flow.id, o.key)] !== undefined),
        )
        .map((flow) => ({
          flow,
          number: CANCELLATION_FLOWS.indexOf(flow) + 1,
          outcomes: outcomesFor(flow, method),
        })),
    [method, who, onlyChanged, proposals],
  );

  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: 'scenario',
      header: 'Scenario',
      width: '260px',
      render: ({ flow, number }) => (
        <div className="flows-scenario" id={flow.id}>
          <span className="flows-scenario-title">
            {number}. {flow.title}
          </span>
          <span className="flows-scenario-tags">
            <Badge>{flow.who}</Badge>
            <span className="flows-scenario-phase">{PHASE_LABEL[flow.phase]}</span>
          </span>
          <span className="flows-when">{flow.when}</span>
        </div>
      ),
    },
    ...OUTCOME_ROWS.map(
      (outcome): Column<Row> => ({
        key: outcome.key,
        header: outcome.label,
        render: ({ flow, outcomes }) => {
          const shown = outcomes[outcome.key];
          // The payment picked doesn't involve this column: nothing to change here.
          if (shown !== flow[outcome.key]) return <OutcomeValue outcome={shown} />;
          const proposal = proposals[cancellationCellKey(flow.id, outcome.key)];
          return (
            <div className="flows-cell">
              {proposal ? (
                <ProposedValue outcome={outcome.key} proposal={proposal} today={shown} />
              ) : (
                <OutcomeValue outcome={shown} />
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="flows-cell-edit"
                  onClick={() => onEditCell({ flowId: flow.id, outcome: outcome.key })}
                  aria-label={`Change ${outcome.label} for ${flow.title}`}
                >
                  <Pencil size={ICON_SIZE.inline} aria-hidden />
                  {proposal ? 'Edit change' : 'Change'}
                </Button>
              )}
            </div>
          );
        },
      }),
    ),
  ];

  return (
    <div className="flows-table-block">
      <div className="filter-bar flows-filter-bar">
        <FilterSelect
          label="Paid with"
          value={methodId}
          onChange={setMethodId}
          options={[
            { value: ANY, label: 'Any payment' },
            ...PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label })),
          ]}
        />
        <FilterSelect
          label="Who cancels"
          value={who}
          onChange={setWho}
          options={[
            { value: ANY, label: 'Anyone' },
            ...ACTORS.map((actor) => ({ value: actor, label: actor })),
          ]}
        />
        <Switch
          checked={onlyChanged}
          onChange={setOnlyChanged}
          label={`Show only changed rows (${changedCount} ${changedCount === 1 ? 'change' : 'changes'})`}
        />
      </div>
      <p className="flows-method-detail" aria-live="polite">
        {method
          ? method.detail
          : 'Showing each flow for any payment. Pick how the booking was paid to see exactly what the mother keeps or loses.'}
      </p>

      <div className="flows-table">
        <Table
          columns={columns}
          rows={rows}
          rowKey={({ flow }) => flow.id}
          empty={onlyChanged ? 'No changes proposed for these filters yet.' : 'No flow matches these filters.'}
          rowClassName={({ outcomes }) => (outcomes.notPossible ? 'flows-row--not-possible' : undefined)}
          renderExpanded={({ flow, outcomes }) =>
            outcomes.notPossible ? (
              <p className="flows-row-note">
                <Info size={ICON_SIZE.inline} aria-hidden />
                <span>{outcomes.notPossible}</span>
              </p>
            ) : flow.gap ? (
              <p className="flows-row-note flows-row-note--gap">
                <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
                <span>
                  <strong>Gap:</strong> {flow.gap}
                </span>
              </p>
            ) : null
          }
        />
      </div>
    </div>
  );
}
