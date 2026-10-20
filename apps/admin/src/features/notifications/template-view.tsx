import type { NotificationTemplate } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  ActionMenu,
  Button,
  Card,
  ConfirmDialog,
  DescriptionList,
  DetailHeader,
  ICON_SIZE,
  MenuItem,
  Pencil,
  Send,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteNotificationTemplate, previewNotificationAudience } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { BroadcastHistory } from './broadcast-history';
import { CHANNEL_HINT, CHANNEL_LABEL, formatCount, mothersLabel } from './notification-labels';
import { PublishDialog } from './publish-dialog';
import { SavedAudience } from './template-audience-fields';
import { LinkSummary, useLinkActionLabel } from './template-link-fields';
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

  // Counting the audience needs manage access, so a view-only operator sees the names only.
  const reach = useQuery({
    queryKey: ['notification-audience-preview', template.audience],
    queryFn: () => previewNotificationAudience(template.audience),
    enabled: canManage,
  });

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
          canManage && (
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
          )
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
        <Card title="Delivery">
          <DescriptionList
            items={[
              {
                label: 'Channel',
                value: (
                  <>
                    {CHANNEL_LABEL[template.channel]}
                    <span className="desc-note">{CHANNEL_HINT[template.channel]}</span>
                  </>
                ),
                wide: true,
              },
              {
                label: 'Link',
                value: <LinkSummary value={template} saved={savedLink} />,
                wide: true,
              },
              {
                label: 'Audience',
                value: (
                  <>
                    <SavedAudience
                      value={template.audience}
                      saved={{ groups: template.audienceGroups, mothers: template.audienceMothers }}
                    />
                    {canManage && (
                      <span className="desc-note">
                        {reach.data
                          ? `${mothersLabel(reach.data.mothers)} · ${formatCount(reach.data.withPushDevice)} with push enabled`
                          : reach.isError
                            ? 'We couldn’t count this audience.'
                            : 'Counting mothers…'}
                      </span>
                    )}
                  </>
                ),
                wide: true,
              },
            ]}
          />
        </Card>
      </div>
      <h3 className="form-section-title">Send history</h3>
      <BroadcastHistory templateId={template.id} />
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
