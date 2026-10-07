import { Table, type Column } from '@admin/components/ui';

import { OutcomeValue } from './outcome-value';
import { MATRIX_COLUMNS, PAYMENT_MIXES, type PaymentMix } from './payment-matrix';

/** Every way of paying, across every way of cancelling — today's outcome in each cell. */
export function PaymentMatrixTable() {
  const columns: Column<PaymentMix>[] = [
    {
      key: 'mix',
      header: 'Paid with',
      width: '220px',
      render: (mix) => (
        <div className="flows-mix">
          <strong>{mix.label}</strong>
          <span>{mix.detail}</span>
        </div>
      ),
    },
    ...MATRIX_COLUMNS.map(
      (column): Column<PaymentMix> => ({
        key: column.key,
        header: column.label,
        render: (mix) => <OutcomeValue outcome={mix.cells[column.key]} />,
      }),
    ),
  ];

  return (
    <div className="flows-matrix">
      <Table columns={columns} rows={[...PAYMENT_MIXES]} rowKey={(mix) => mix.id} wrap />
    </div>
  );
}
