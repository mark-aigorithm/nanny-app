import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminRefundResponse } from '@nanny-app/shared';

import { Button, Feedback, Field, Modal } from '@admin/components/ui';
import { refundBooking } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatEgp } from '@admin/lib/format';

type RefundMethod = 'PAYMOB' | 'CARE_POINTS';

type RefundModalProps = {
  bookingId: number;
  /** The overpaid amount (EGP) available to refund. */
  refundableAmount: number;
  onClose: () => void;
  onRefunded: (result: AdminRefundResponse) => void;
};

/**
 * Settle a booking overpayment after an edit lowered the total: refund the money
 * to the card via Paymob, or grant the mother a custom number of Care Points
 * (the EGP difference is shown for reference — there's no fixed conversion).
 */
export function RefundModal({ bookingId, refundableAmount, onClose, onRefunded }: RefundModalProps) {
  const [method, setMethod] = useState<RefundMethod>('PAYMOB');
  const [amount, setAmount] = useState(refundableAmount.toFixed(2));
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      refundBooking(bookingId, {
        method,
        reason: reason.trim(),
        ...(method === 'PAYMOB' ? { amount: Number(amount) } : { points: Math.round(Number(points)) }),
      }),
    onSuccess: (result) => onRefunded(result),
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit() {
    setFormError(null);
    if (!reason.trim()) {
      setFormError('Add a short reason for the refund.');
      return;
    }
    if (method === 'PAYMOB') {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        setFormError('Enter a refund amount greater than zero.');
        return;
      }
      if (value > refundableAmount + 0.005) {
        setFormError(`The refund can't exceed the overpaid amount (${formatEgp(refundableAmount)}).`);
        return;
      }
    } else {
      const value = Number(points);
      if (!Number.isInteger(value) || value <= 0) {
        setFormError('Enter a whole number of Care Points to grant.');
        return;
      }
    }
    mutation.mutate();
  }

  return (
    <Modal
      title="Refund the overpayment"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Refunding…' : 'Refund'}
          </Button>
        </>
      }
    >
      <p className="panel-lead">
        This edit left the mother overpaid by <strong>{formatEgp(refundableAmount)}</strong>. Choose how
        to return it.
      </p>

      <div className="refund-methods">
        <button
          type="button"
          className={method === 'PAYMOB' ? 'addon-chip selected' : 'addon-chip'}
          onClick={() => setMethod('PAYMOB')}
        >
          <span className="addon-name">Refund to card</span>
          <span className="addon-fee">Paymob</span>
        </button>
        <button
          type="button"
          className={method === 'CARE_POINTS' ? 'addon-chip selected' : 'addon-chip'}
          onClick={() => setMethod('CARE_POINTS')}
        >
          <span className="addon-name">Grant Care Points</span>
          <span className="addon-fee">Custom</span>
        </button>
      </div>

      {method === 'PAYMOB' ? (
        <Field label="Amount to refund" hint={`Up to ${formatEgp(refundableAmount)}.`}>
          <span className="unit-input">
            <input
              type="number"
              min="0"
              step="0.01"
              max={refundableAmount.toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="unit-input-suffix">EGP</span>
          </span>
        </Field>
      ) : (
        <Field
          label="Care Points to grant"
          hint={`For reference, the overpayment is ${formatEgp(refundableAmount)}.`}
        >
          <span className="unit-input">
            <input
              type="number"
              min="1"
              step="1"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
            <span className="unit-input-suffix">points</span>
          </span>
        </Field>
      )}

      <Field label="Reason" hint="Shown to the mother in her notification.">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Reduced from 6 to 4 hours"
        />
      </Field>

      {formError && <Feedback tone="error">{formError}</Feedback>}
    </Modal>
  );
}
