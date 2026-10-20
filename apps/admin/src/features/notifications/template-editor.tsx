import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import { NotificationTemplateInputSchema } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  Button,
  Card,
  ConfirmDialog,
  DetailHeader,
  ICON_SIZE,
  MenuItem,
  SegmentedControl,
  Trash2,
  useToast,
  type SegmentedOption,
} from '@admin/components/ui';
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  updateNotificationTemplate,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { CHANNEL_HINT, CHANNEL_LABEL } from './notification-labels';
import { TemplateAudienceFields } from './template-audience-fields';
import { TemplateContentFields } from './template-content-fields';
import { TEMPLATE_FIELD_ID, issueSummary, templateIssues, type TemplateField } from './template-issues';
import { TemplateLinkFields, useLinkActionLabel } from './template-link-fields';
import { TemplatePreview } from './template-preview';

type Channel = NotificationTemplateInput['channel'];

const CHANNEL_OPTIONS: readonly SegmentedOption<Channel>[] = (['IN_APP', 'PUSH', 'BOTH'] as const).map(
  (value) => ({ value, label: CHANNEL_LABEL[value] }),
);

const BLANK: NotificationTemplateInput = {
  name: '',
  title: '',
  body: '',
  imageUrl: null,
  channel: 'BOTH',
  targetType: null,
  packageId: null,
  promoCodeId: null,
  audience: { type: 'GROUPS', groupIds: [] },
};

/** A saved template → the editor's form state (the same shape the API takes back). */
export function toTemplateInput(t: NotificationTemplate): NotificationTemplateInput {
  return {
    name: t.name,
    title: t.title,
    body: t.body,
    imageUrl: t.imageUrl,
    channel: t.channel,
    targetType: t.targetType,
    packageId: t.packageId,
    promoCodeId: t.promoCodeId,
    audience: t.audience,
  };
}

/** What is validated and sent: the text fields without stray spaces. */
const clean = (v: NotificationTemplateInput): NotificationTemplateInput => ({
  ...v,
  name: v.name.trim(),
  title: v.title.trim(),
  body: v.body.trim(),
});

type TemplateEditorProps = {
  /** The saved template. Omit for /notifications/new, whose first Save creates it. */
  template?: NotificationTemplate;
};

/** One notification template: content, image, channel, link and audience, saved in one request. */
export function TemplateEditor({ template }: TemplateEditorProps) {
  const isNew = template === undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('notifications');
  const [values, setValues] = useState<NotificationTemplateInput>(() =>
    template ? toTemplateInput(template) : BLANK,
  );
  const [dirty, setDirty] = useState(false);
  // Fields the admin has left: their problems show from then on.
  const [touched, setTouched] = useState<ReadonlySet<TemplateField>>(new Set());
  // A Save was tried with problems: every problem shows, plus the summary.
  const [attempted, setAttempted] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Bumped on each failed Save so the summary takes focus every time, not only the first.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryHeadingId = useId();
  const channelHintId = useId();
  // Set just before navigating away on purpose (create, delete) so the guard lets it through.
  const leavingOnPurpose = useRef(false);

  // Unsaved edits: ask before an in-app navigation, and let the browser ask
  // before the tab closes or reloads.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingOnPurpose.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const payload = useMemo(() => clean(values), [values]);
  const validation = useMemo(() => NotificationTemplateInputSchema.safeParse(payload), [payload]);
  const issues = useMemo(
    () => templateIssues(validation.success ? undefined : validation.error, payload),
    [validation, payload],
  );
  const summary = issueSummary(issues);
  const shown = (field: TemplateField) => (attempted || touched.has(field) ? issues[field] : undefined);

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  const update = (patch: Partial<NotificationTemplateInput>) => {
    setValues((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const markTouched = (field: TemplateField) =>
    setTouched((t) => (t.has(field) ? t : new Set([...t, field])));

  const savedAudience = { groups: template?.audienceGroups ?? [], mothers: template?.audienceMothers ?? [] };
  const savedLink = { package: template?.package ?? null, promoCode: template?.promoCode ?? null };
  const linkLabel = useLinkActionLabel(values, savedLink, !canManage);

  const save = useMutation({
    mutationFn: () =>
      template ? updateNotificationTemplate(template.id, payload) : createNotificationTemplate(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(['notification-templates', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'], exact: true });
      setDirty(false);
      toast.success('Saved');
      if (isNew) {
        leavingOnPurpose.current = true;
        navigate(`/notifications/${saved.id}`, { replace: true });
      }
    },
    onError: (err) => toast.error('Couldn’t save the notification', apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => deleteNotificationTemplate(template?.id ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template deleted');
      leavingOnPurpose.current = true;
      navigate('/notifications');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Couldn’t delete the template', apiErrorMessage(err));
    },
  });

  // Inputs lock while a save is in flight so an edit can't be marked saved by its response.
  const locked = !canManage || save.isPending;
  // A new template has nothing on the server yet, so it always has something to save.
  const unsaved = dirty || isNew;

  const trySave = () => {
    if (imageBusy || save.isPending) return;
    if (validation.success) {
      save.mutate();
      return;
    }
    setAttempted(true);
    setSummaryFocus((n) => n + 1);
  };

  const problems = attempted ? summary.length : 0;
  const status =
    problems > 0
      ? `${problems} ${problems === 1 ? 'problem' : 'problems'} to fix before saving.`
      : imageBusy
        ? 'Finish the image before saving.'
        : !unsaved
          ? 'Saved. Ready to publish.'
          : isNew && !dirty
            ? 'Not saved yet. Save to create the template.'
            : 'Unsaved changes. Save before publishing.';

  return (
    <section>
      <DetailHeader
        title={values.name.trim() || (isNew ? 'New notification' : 'Untitled notification')}
        subtitle="A template: save it, then publish to send it now. Publish it again whenever you like."
        backTo="/notifications"
        backLabel="Notifications"
        actions={
          canManage && (
            <>
              <Button
                variant={unsaved ? 'primary' : 'ghost'}
                onClick={trySave}
                disabled={!unsaved || save.isPending || imageBusy}
              >
                Save
              </Button>
              {!isNew && (
                <ActionMenu label="More actions for this notification">
                  <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setConfirmDelete(true)}>
                    Delete template
                  </MenuItem>
                </ActionMenu>
              )}
            </>
          )
        }
      />
      {canManage && (
        <p role="status" className={`template-editor-status${problems > 0 ? ' template-editor-status--problem' : ''}`}>
          {status}
        </p>
      )}
      {attempted && summary.length > 0 && (
        <div
          className="error-summary"
          role="alert"
          aria-labelledby={summaryHeadingId}
          tabIndex={-1}
          ref={summaryRef}
        >
          <h3 id={summaryHeadingId}>
            Fix {summary.length} {summary.length === 1 ? 'problem' : 'problems'} before saving
          </h3>
          <ul>
            {summary.map(({ field, message }) => (
              <li key={field}>
                <a
                  href={`#${TEMPLATE_FIELD_ID[field]}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(TEMPLATE_FIELD_ID[field])?.focus();
                  }}
                >
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="template-editor">
        <div className="template-editor-form">
          <Card title="Content">
            <TemplateContentFields
              values={values}
              onChange={update}
              onBlurField={markTouched}
              errors={{ name: shown('name'), title: shown('title'), body: shown('body'), imageUrl: shown('imageUrl') }}
              readOnly={locked}
              onImageBusyChange={setImageBusy}
            />
          </Card>
          <Card title="Channel">
            <SegmentedControl
              legend="Channel"
              hideLegend
              value={values.channel}
              options={CHANNEL_OPTIONS}
              onChange={(channel) => update({ channel })}
              disabled={locked}
              describedBy={channelHintId}
            />
            <p className="field-hint" id={channelHintId}>
              {CHANNEL_HINT[values.channel]}
            </p>
          </Card>
          <Card title="Link">
            <TemplateLinkFields
              value={values}
              onChange={(link) => update(link)}
              saved={savedLink}
              readOnly={!canManage}
              disabled={save.isPending}
              error={shown('link')}
            />
          </Card>
          <Card title="Audience">
            <TemplateAudienceFields
              value={values.audience}
              onChange={(audience) => update({ audience })}
              saved={savedAudience}
              readOnly={!canManage}
              disabled={save.isPending}
              error={shown('audience')}
              errorId={`${TEMPLATE_FIELD_ID.audience}-error`}
            />
          </Card>
        </div>
        <TemplatePreview
          title={values.title}
          body={values.body}
          imageUrl={values.imageUrl ?? null}
          channel={values.channel}
          linkLabel={linkLabel}
        />
      </div>
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your changes to this notification will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
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
