import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { GrantPointsSchema, type RewardWalletSummary } from '@nanny-app/shared';

import { Button, Feedback, Field, Modal, useToast } from '@admin/components/ui';
import { grantWalletPoints } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type Props = {
  wallet: RewardWalletSummary;
  onClose: () => void;
};

export function GrantPointsModal({ wallet, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { points: number; reason: string }) =>
      grantWalletPoints(wallet.userId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData<RewardWalletSummary[]>(['reward-wallets'], (prev) =>
        prev?.map((w) => (w.userId === updated.userId ? updated : w)),
      );
      void queryClient.invalidateQueries({ queryKey: ['reward-history', wallet.userId] });
      toast.success('Points updated', `${wallet.name}’s balance is now ${updated.pointsBalance}.`);
      onClose();
    },
    onError: (err) => toast.error('Couldn’t update points', apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = GrantPointsSchema.safeParse({ points: Number(points), reason });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? issue.message : 'Invalid input');
      return;
    }
    setFormError(null);
    mutation.mutate(parsed.data);
  }

  const parsedPoints = Number(points);
  const isRevoke = Number.isFinite(parsedPoints) && parsedPoints < 0;

  return (
    <Modal
      title={`Adjust Care Points — ${wallet.name}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="grant-points-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isRevoke ? 'Revoke points' : 'Grant points'}
          </Button>
        </>
      }
    >
      <form id="grant-points-form" onSubmit={handleSubmit}>
        <p className="reward-modal-lead">
          Current balance: <strong>{wallet.pointsBalance}</strong> Care Points. Enter a positive
          amount to grant, or a negative amount to revoke. The parent is notified.
        </p>
        <Field label="Points" hint="Positive grants, negative revokes (e.g. -50).">
          <input
            type="number"
            step="1"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="e.g. 100"
            required
            autoFocus
          />
        </Field>
        <Field label="Reason" hint="Shown to the parent in their notification.">
          <input
            type="text"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Goodwill for a delayed booking"
            required
          />
        </Field>
        {formError && <Feedback tone="error">{formError}</Feedback>}
      </form>
    </Modal>
  );
}
