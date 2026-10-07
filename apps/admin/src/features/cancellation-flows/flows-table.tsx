import { useMemo, useState } from 'react';

import {
  Badge,
  FilterSelect,
  ICON_SIZE,
  Info,
  Table,
  TriangleAlert,
  type Column,
} from '@admin/components/ui';

import { CANCELLATION_FLOWS, OUTCOME_ROWS, type CancellationActor, type CancellationFlow } from './flows';
import { OutcomeValue } from './outcome-value';
import { PAYMENT_METHODS, outcomesFor } from './payment-methods';

const ANY = 'ANY';

const PHASE_LABEL: Record<CancellationFlow['phase'], string> = {
  before: 'Before payment',
  after: 'After payment',
  other: 'Any time',
};

const ACTORS: readonly CancellationActor[] = ['Mother', 'Nanny', 'Mother or nanny', 'Admin', 'System'];

/**
 * Every cancellation flow in one table, re-read for whichever payment method is
 * picked — the single view of what happens today. Each row's gap, or why it
 * can't happen with the picked payment, sits in a full-width line beneath it.
 */
export function FlowsTable() {
  const [methodId, setMethodId] = useState<string>(ANY);
  const [who, setWho] = useState<string>(ANY);

  const method = PAYMENT_METHODS.find((m) => m.id === methodId);

  const rows = useMemo(
    () =>
      CANCELLATION_FLOWS.filter((flow) => who === ANY || flow.who === who).map((flow) => ({
        flow,
        number: CANCELLATION_FLOWS.indexOf(flow) + 1,
        outcomes: outcomesFor(flow, method),
      })),
    [method, who],
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
        render: ({ outcomes }) => <OutcomeValue outcome={outcomes[outcome.key]} />,
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
          empty="No flow matches these filters."
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
