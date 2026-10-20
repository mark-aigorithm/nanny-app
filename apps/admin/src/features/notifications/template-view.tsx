import type { NotificationTemplate } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  ActionMenu,
  Button,
  ConfirmDialog,
  DetailHeader,
  History,
  ICON_SIZE,
  MenuItem,
  Pencil,
  Send,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { DeliverySummary } from './delivery-summary';
import { PublishDialog } from './publish-dialog';
import { useLinkActionLabel } from './template-link-fields';
import { TemplatePreview } from './template-preview';

type TemplateViewProps = {
  template: NotificationTemplate;
  /** Opens the editor on this template. */
  onEdit: () => void;
};

/**
 * A saved template as mothers will see it, with who gets it and its send
 * history. Edit opens the editor; Publish sends it as saved.
 */
export function TemplateView({ template, onEdit }: TemplateViewProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('notifications');
  // The list's "Publish" opens the template at ?publish=1: the dialog is that parameter.
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savedLink = { package: template.package, promoCode: template.promoCode };
  const linkLabel = useLinkActionLabel(template, savedLink, true);

  const remove = useMutation({
    mutationFn: () => deleteNotificationTemplate(template.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template deleted');
      navigate('/notifications');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Couldn’t delete the template', apiErrorMessage(err));
    },
  });

  const publishing = canManage && searchParams.get('publish') === '1';
  const openPublish = () => setSearchParams({ publish: '1' }, { replace: true });
  const closePublish = () => setSearchParams({}, { replace: true });

  return (
    <section>
      <DetailHeader
        title={template.name}
        subtitle="Publish sends it now, exactly as shown. Publish it again whenever you like."
        backTo="/notifications"
        backLabel="Notification Center"
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => navigate(`/notifications/${template.id}/history`)}
            >
              <History size={ICON_SIZE.inline} aria-hidden />
              History
              {template.publishCount > 0 && (
                <span className="btn-count">{template.publishCount}</span>
              )}
            </Button>
            {canManage && (
              <>
                <Button variant="ghost" onClick={onEdit}>
                  <Pencil size={ICON_SIZE.inline} aria-hidden />
                  Edit
                </Button>
                <Button onClick={openPublish}>
                  <Send size={ICON_SIZE.inline} aria-hidden />
                  Publish
                </Button>
                <ActionMenu label="More actions for this notification">
                  <MenuItem
                    danger
                    icon={<Trash2 size={ICON_SIZE.menu} />}
                    onSelect={() => setConfirmDelete(true)}
                  >
                    Delete template
                  </MenuItem>
                </ActionMenu>
              </>
            )}
          </>
        }
      />
      <div className="template-view">
        <TemplatePreview
          title={template.title}
          body={template.body}
          imageUrl={template.imageUrl}
          channel={template.channel}
          linkLabel={linkLabel}
          wide
        />
        <DeliverySummary template={template} />
      </div>
      {publishing && <PublishDialog template={template} onClose={closePublish} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this template?"
          message="Its send history is kept, and mothers keep what they already received."
          confirmLabel="Delete template"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
