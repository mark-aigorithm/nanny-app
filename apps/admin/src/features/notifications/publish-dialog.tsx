import type { NotificationBroadcast, NotificationTemplate } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, ErrorState, LoadingState, Modal, Spinner, useToast } from '@admin/components/ui';
import { previewNotificationAudience, publishNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { formatCount, mothersLabel } from './notification-labels';

type ResultToast = { tone: 'success' | 'warning'; title: string; message: string };

/** A finished broadcast → the toast that reports it. PARTIAL and FAILED are warnings. */
export function broadcastResultToast(b: NotificationBroadcast): ResultToast {
  const pushes = (n: number) => `${formatCount(n)} ${n === 1 ? 'push' : 'pushes'}`;
  const parts: string[] = [];
  if (b.channel !== 'PUSH') parts.push(`${formatCount(b.inAppCreated)} in the inbox`);
  if (b.channel !== 'IN_APP') {
    parts.push(`${pushes(b.pushSent)} sent`);
    if (b.noDevice > 0) parts.push(`${formatCount(b.noDevice)} with no device`);
  }
  const skipped = b.skippedGroupIds.length;
  if (skipped > 0) parts.push(`${skipped} deleted ${skipped === 1 ? 'group was' : 'groups were'} skipped`);
  const to = mothersLabel(b.targeted);

  if (b.status === 'FAILED') {
    return {
      tone: 'warning',
      title: `Sending stopped part-way to ${to}`,
      message: [b.error ?? 'The server stopped before it finished.', ...parts].join(' · '),
    };
  }
  if (b.status === 'PARTIAL') {
    return { tone: 'warning', title: `Sent to ${to}, but ${pushes(b.pushFailed)} failed`, message: parts.join(' · ') };
  }
  if (b.status === 'SENDING') {
    return {
      tone: 'success',
      title: `Sending to ${to}`,
      message: 'It is still going out; the send history updates when it finishes.',
    };
  }
  return { tone: 'success', title: `Sent to ${to}`, message: parts.join(' · ') };
}

type PublishDialogProps = {
  template: NotificationTemplate;
  onClose: () => void;
};

/**
 * "Send to N mothers now?" — publishing can't be undone, so the dialog counts
 * the audience again on open (a dynamic group may have grown since the editor
 * last asked) and only a count fetched after it opened can be confirmed. While
 * the send runs the dialog can't be closed or sent again.
 */
export function PublishDialog({ template, onClose }: PublishDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const preview = useQuery({
    queryKey: ['notification-audience-preview', template.audience],
    queryFn: () => previewNotificationAudience(template.audience),
    refetchOnMount: 'always',
  });
  const fresh =
    preview.data && !preview.isFetching && preview.dataUpdatedAt >= openedAt ? preview.data : null;

  const publish = useMutation({
    mutationFn: () => publishNotificationTemplate(template.id),
    onSuccess: (broadcast) => {
      const result = broadcastResultToast(broadcast);
      toast.toast({ ...result, duration: result.tone === 'warning' ? 10_000 : undefined });
      onClose();
    },
    onError: (err) => {
      toast.error('Couldn’t send the notification', apiErrorMessage(err));
      onClose();
    },
    // Counts, last-sent date and history change whether it worked or not.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['notification-templates'] }),
  });

  const sending = publish.isPending;
  const close = () => {
    if (!sending) onClose();
  };
  const pushPart = template.channel === 'IN_APP' || !fresh ? '' : ` (${formatCount(fresh.withPushDevice)} by push)`;

  return (
    <Modal
      title="Send this notification?"
      size="sm"
      onClose={close}
      dismissible={!sending}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => publish.mutate()} disabled={sending || !fresh || fresh.mothers === 0}>
            {sending ? 'Sending…' : fresh ? `Send to ${mothersLabel(fresh.mothers)}` : 'Send'}
          </Button>
        </>
      }
    >
      {preview.isError ? (
        <ErrorState
          title="We couldn’t count the audience"
          message={apiErrorMessage(preview.error)}
          onRetry={() => void preview.refetch()}
          retrying={preview.isFetching}
        />
      ) : !fresh ? (
        <LoadingState label="Counting mothers…" />
      ) : fresh.mothers === 0 ? (
        <p className="modal-text">
          No mothers match this audience right now, so there is no one to send it to. Change the audience and save
          first.
        </p>
      ) : (
        <p className="modal-text">
          Send '{template.name}' to {mothersLabel(fresh.mothers)}
          {pushPart} now? This can't be undone.
        </p>
      )}
      {sending && (
        <div className="publish-sending">
          <Spinner size={16} aria-label="Sending" />
          <span>Sending now. Keep this tab open until it finishes.</span>
        </div>
      )}
    </Modal>
  );
}
