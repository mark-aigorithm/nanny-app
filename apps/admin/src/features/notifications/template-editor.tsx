import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import { NotificationTemplateInputSchema } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  ConfirmDialog,
  DetailHeader,
  ICON_SIZE,
  SegmentedControl,
  Send,
  useToast,
  type SegmentedOption,
} from '@admin/components/ui';
import { createNotificationTemplate, updateNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useFitToViewport } from '@admin/lib/use-fit-to-viewport';

import { CHANNEL_HINT, CHANNEL_LABEL } from './notification-labels';
import { TemplateAudienceFields } from './template-audience-fields';
import { TemplateContentFields } from './template-content-fields';
import {
  TEMPLATE_FIELD_ID,
  issueSummary,
  templateIssues,
  type TemplateField,
} from './template-issues';
import { TemplateLinkFields, useLinkActionLabel } from './template-link-fields';
import { TemplatePreview } from './template-preview';

type Channel = NotificationTemplateInput['channel'];

const CHANNEL_OPTIONS: readonly SegmentedOption<Channel>[] = (
  ['IN_APP', 'PUSH', 'BOTH'] as const
).map((value) => ({ value, label: CHANNEL_LABEL[value] }));

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
  /** Back to the saved template's view, after a Save or on Cancel; `publish` opens its Publish dialog. */
  onDone?: (then?: 'publish') => void;
};

/**
 * Writing one notification template: content and image, then channel, link and
 * audience, saved in one request. Publishing happens from the saved template's
 * view, never mid-edit.
 */
export function TemplateEditor({ template, onDone }: TemplateEditorProps) {
  const isNew = template === undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('notifications');
  const asideRef = useFitToViewport<HTMLDivElement>();
  const [values, setValues] = useState<NotificationTemplateInput>(() =>
    template ? toTemplateInput(template) : BLANK,
  );
  const [dirty, setDirty] = useState(false);
  // Fields the admin has left: their problems show from then on.
  const [touched, setTouched] = useState<ReadonlySet<TemplateField>>(new Set());
  // A Save was tried with problems: every problem shows, plus the summary.
  const [attempted, setAttempted] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  // Bumped on each failed Save so the summary takes focus every time, not only the first.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryHeadingId = useId();
  const channelHintId = useId();
  // Set just before leaving on purpose (a successful Save) so the guard lets it through.
  const leavingOnPurpose = useRef(false);

  // Unsaved edits: ask before an in-app navigation (Cancel back to the view
  // included), and let the browser ask before the tab closes or reloads.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leavingOnPurpose.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
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
  const shown = (field: TemplateField) =>
    attempted || touched.has(field) ? issues[field] : undefined;

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  const update = (patch: Partial<NotificationTemplateInput>) => {
    setValues((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const markTouched = (field: TemplateField) =>
    setTouched((t) => (t.has(field) ? t : new Set([...t, field])));

  const savedAudience = {
    groups: template?.audienceGroups ?? [],
    mothers: template?.audienceMothers ?? [],
  };
  const savedLink = { package: template?.package ?? null, promoCode: template?.promoCode ?? null };
  const linkLabel = useLinkActionLabel(values, savedLink, !canManage);

  // `publish`: Save and publish — once saved, the template opens on its Publish confirmation.
  const save = useMutation({
    mutationFn: (_then: { publish: boolean }) =>
      template
        ? updateNotificationTemplate(template.id, payload)
        : createNotificationTemplate(payload),
    onSuccess: (saved, { publish }) => {
      queryClient.setQueryData(['notification-templates', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'], exact: true });
      setDirty(false);
      toast.success('Saved');
      leavingOnPurpose.current = true;
      if (isNew)
        navigate(`/notifications/${saved.id}${publish ? '?publish=1' : ''}`, { replace: true });
      else done(publish ? 'publish' : undefined);
    },
    onError: (err) => toast.error('Couldn’t save the notification', apiErrorMessage(err)),
  });

  // Inputs lock while a save is in flight so an edit can't be marked saved by its response.
  const locked = !canManage || save.isPending;
  // A new template has nothing on the server yet, so it always has something to save.
  const unsaved = dirty || isNew;
  // Cancel and a successful Save both lead back; the guard asks first if edits would be lost.
  const done = (then?: 'publish') => (onDone && !isNew ? onDone(then) : navigate('/notifications'));

  const trySave = (publish: boolean) => {
    if (imageBusy || save.isPending) return;
    if (validation.success) {
      save.mutate({ publish });
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
        : isNew && !dirty
          ? 'Not saved yet. Save to create the template.'
          : !dirty
            ? 'No changes yet.'
            : 'Unsaved changes.';

  return (
    <section>
      <DetailHeader
        // The saved name, not the field being typed in.
        title={template ? template.name : 'Create new notification'}
        subtitle={
          isNew
            ? 'Write it and choose who gets it. Save it to send later, or save and publish it now.'
            : 'Editing. Save takes you back to the template; Save and publish sends it once you confirm.'
        }
        backTo="/notifications"
        backLabel="Notification Center"
      />
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
              errors={{
                name: shown('name'),
                title: shown('title'),
                body: shown('body'),
                imageUrl: shown('imageUrl'),
              }}
              readOnly={locked}
              onImageBusyChange={setImageBusy}
            />
          </Card>
          <Card title="Delivery">
            <div className="delivery-row">
              <div className="delivery-part">
                <h4 className="delivery-part-title">Channel</h4>
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
              </div>
              <div className="delivery-part">
                <h4 className="delivery-part-title">Tapping it opens</h4>
                <TemplateLinkFields
                  value={values}
                  onChange={(link) => update(link)}
                  saved={savedLink}
                  readOnly={!canManage}
                  disabled={save.isPending}
                  error={shown('link')}
                />
              </div>
            </div>
            <div className="delivery-part delivery-part--audience">
              <h4 className="delivery-part-title">Audience</h4>
              <TemplateAudienceFields
                value={values.audience}
                onChange={(audience) => update({ audience })}
                saved={savedAudience}
                readOnly={!canManage}
                disabled={save.isPending}
                error={shown('audience')}
                errorId={`${TEMPLATE_FIELD_ID.audience}-error`}
              />
            </div>
          </Card>
        </div>
        <div className="template-editor-aside" ref={asideRef}>
          <TemplatePreview
            title={values.title}
            body={values.body}
            imageUrl={values.imageUrl ?? null}
            channel={values.channel}
            linkLabel={linkLabel}
          />
          {canManage && (
            <div className="editor-save-panel">
              <p
                role="status"
                className={`editor-save-status${problems > 0 ? ' editor-save-status--problem' : ''}`}
              >
                {status}
              </p>
              <Button
                className="editor-save-primary"
                onClick={() => trySave(true)}
                disabled={!unsaved || save.isPending || imageBusy}
              >
                <Send size={ICON_SIZE.inline} aria-hidden />
                {save.isPending && save.variables?.publish ? 'Saving…' : 'Save and publish'}
              </Button>
              <div className="editor-save-secondary">
                <Button
                  variant="ghost"
                  onClick={() => trySave(false)}
                  disabled={!unsaved || save.isPending || imageBusy}
                >
                  {save.isPending && !save.variables?.publish ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={() => done()} disabled={save.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
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
    </section>
  );
}
