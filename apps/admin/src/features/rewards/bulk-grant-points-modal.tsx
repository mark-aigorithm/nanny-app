import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { BulkGrantPointsSchema, type BulkGrantPointsResult } from '@nanny-app/shared';

import { Button, ConfirmDialog, Feedback, Field, Modal, useToast } from '@admin/components/ui';
import { formatCount, mothersLabel } from '@admin/features/notifications/notification-labels';
import { TemplateAudienceFields, type AudienceValue } from '@admin/features/notifications/template-audience-fields';
import { bulkGrantPoints, previewBulkGrantAudience } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

const FIELD_ID = 'bulk-grant-audience';
const ERROR_ID = 'bulk-grant-audience-error';
const PREVIEW_KEY = 'bulk-grant-audience-preview';
const NO_SAVED_NAMES = { groups: [], mothers: [] };

/** The notification each mother gets, worded as the backend words a grant. */
function notificationBody(points: number, reason: string): string {
  return `You've been given ${points > 0 ? formatCount(points) : '…'} Care Points: ${reason.trim() || '…'}`;
}

/** "Granted 50 Care Points to 1,240 mothers", plus anything that didn't go to plan. */
function resultMessage(result: BulkGrantPointsResult): string {
  const notes = [`Granted ${formatCount(result.points)} Care Points to ${mothersLabel(result.granted)}.`];
  if (result.skippedGroupIds.length > 0) {
    notes.push(`${result.skippedGroupIds.length === 1 ? 'A chosen group was' : 'Some chosen groups were'} deleted and skipped.`);
  }
  if (result.pushFailed > 0) {
    notes.push(`${formatCount(result.pushFailed)} phone notifications didn’t go through; it’s still in their inbox.`);
  }
  return notes.join(' ');
}

/**
 * The same Care Points to many mothers at once: groups or hand-picked mothers
 * (the announcement picker), an amount and a reason. Each mother gets the
 * points, a history entry, and a notification carrying the reason. Grant only;
 * revoking stays on a single wallet's row.
 */
export function BulkGrantPointsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [audience, setAudience] = useState<AudienceValue>({ type: 'GROUPS', groupIds: [] });
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [audienceError, setAudienceError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);

  const chosen = audience.type === 'GROUPS' ? audience.groupIds : audience.motherIds;
  // The same cache entry the picker's live count fills, so confirming rarely waits.
  const reach = useQuery({
    queryKey: [PREVIEW_KEY, audience],
    queryFn: () => previewBulkGrantAudience(audience),
    enabled: confirming,
  });

  const mutation = useMutation({
    mutationFn: bulkGrantPoints,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['reward-wallets'] });
      void queryClient.invalidateQueries({ queryKey: ['reward-history'] });
      toast.success('Care Points granted', resultMessage(result));
      onClose();
    },
    onError: (err) => {
      setConfirming(false);
      toast.error('Couldn’t grant the points', apiErrorMessage(err));
    },
  });

  const parsedPoints = Number(points);
  const dirty = chosen.length > 0 || points !== '' || reason !== '';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (chosen.length === 0) {
      setAudienceError('Choose at least one group or mother.');
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    setAudienceError(undefined);
    const parsed = BulkGrantPointsSchema.safeParse({ audience, points: parsedPoints, reason });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the amount and the reason.');
      return;
    }
    setFormError(null);
    setConfirming(true);
  }

  const confirmMessage = reach.data
    ? `${mothersLabel(reach.data.mothers)} will each get ${formatCount(parsedPoints)} Care Points and a notification saying why. This can’t be undone in one step.`
    : reach.isError
      ? `We couldn’t count this audience. Each mother in it will get ${formatCount(parsedPoints)} Care Points and a notification.`
      : 'Counting mothers…';

  return (
    <Modal
      title="Grant Care Points to a group"
      onClose={onClose}
      size="lg"
      dismissible={!dirty && !mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="bulk-grant-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Granting…' : 'Grant points…'}
          </Button>
        </>
      }
    >
      <form id="bulk-grant-form" className="reward-modal-form" onSubmit={handleSubmit} noValidate>
        <p className="reward-modal-lead">
          Every mother you choose gets the same amount, added to her balance, and a notification with your
          reason. To take points away, use a single wallet’s menu.
        </p>
        <TemplateAudienceFields
          value={audience}
          onChange={(next) => {
            setAudience(next);
            setAudienceError(undefined);
          }}
          saved={NO_SAVED_NAMES}
          readOnly={false}
          disabled={mutation.isPending}
          error={audienceError}
          errorId={ERROR_ID}
          previewAudience={previewBulkGrantAudience}
          previewKey={PREVIEW_KEY}
          fieldId={FIELD_ID}
          noun="grant"
          verb="grant"
        />
        <Field label="Points for each mother" hint="A whole number, more than zero.">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="e.g. 50"
            disabled={mutation.isPending}
          />
        </Field>
        <Field label="Reason" hint="Written into the notification each mother gets, and into her points history.">
          <input
            type="text"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Sorry for Friday’s app outage"
            disabled={mutation.isPending}
          />
        </Field>
        <div className="bulk-grant-preview" aria-label="What each mother sees">
          <span className="bulk-grant-preview-label">What each mother sees</span>
          <strong>You received Care Points</strong>
          <span>{notificationBody(Number.isFinite(parsedPoints) ? parsedPoints : 0, reason)}</span>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
      </form>
      {confirming && (
        <ConfirmDialog
          title={`Grant ${formatCount(parsedPoints)} Care Points?`}
          message={confirmMessage}
          confirmLabel={reach.data ? `Grant to ${mothersLabel(reach.data.mothers)}` : 'Grant points'}
          cancelLabel="Back"
          busy={mutation.isPending}
          onConfirm={() => mutation.mutate({ audience, points: parsedPoints, reason: reason.trim() })}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Modal>
  );
}
