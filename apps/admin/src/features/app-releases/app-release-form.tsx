import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import {
  CreateAppReleaseSchema,
  UpdateAppReleaseSchema,
  type AppPlatform,
  type AppRelease,
} from '@nanny-app/shared';

import { Field, FormModal, ICON_SIZE, Input, Select, Switch, TriangleAlert, useToast } from '@admin/components/ui';
import { createAppRelease, updateAppRelease } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

export const PLATFORM_LABELS: Record<AppPlatform, string> = { ios: 'iOS', android: 'Android' };

type AppReleaseFormModalProps = {
  /** The release to edit; omit to add a new one. Only mandatory and notes are editable. */
  release?: AppRelease;
  onClose: () => void;
};

export function AppReleaseFormModal({ release, onClose }: AppReleaseFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [platform, setPlatform] = useState<AppPlatform>(release?.platform ?? 'ios');
  const [version, setVersion] = useState(release?.version ?? '');
  const [mandatory, setMandatory] = useState(release?.mandatory ?? false);
  const [releaseNotes, setReleaseNotes] = useState(release?.releaseNotes ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const mandatoryHintId = useId();
  // Turning "mandatory" on blocks every older install, so the form warns that
  // the build has to be live in the store first.
  const becomesMandatory = mandatory && !release?.mandatory;
  const platformLabel = PLATFORM_LABELS[release?.platform ?? platform];

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AppRelease>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['app-releases'] });
      toast.success(release ? 'Release updated' : 'Release added', `${PLATFORM_LABELS[saved.platform]} ${saved.version}`);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    const notes = releaseNotes.trim();
    let save: () => Promise<AppRelease>;
    if (release) {
      const parsed = UpdateAppReleaseSchema.safeParse({ mandatory, releaseNotes: notes || null });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      save = () => updateAppRelease(release.id, parsed.data);
    } else {
      const parsed = CreateAppReleaseSchema.safeParse({
        platform,
        version: version.trim(),
        mandatory,
        ...(notes && { releaseNotes: notes }),
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      save = () => createAppRelease(parsed.data);
    }
    saveMutation.mutate(save);
  }

  return (
    <FormModal
      title={release ? `Edit ${PLATFORM_LABELS[release.platform]} ${release.version}` : 'Add release'}
      submitLabel={release ? 'Save changes' : becomesMandatory ? 'Add mandatory release' : 'Add release'}
      size="sm"
      busy={saveMutation.isPending}
      submitDisabled={!release && version.trim() === ''}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      {!release && (
        <>
          <Field label="Platform">
            <Select
              value={platform}
              options={[
                { value: 'ios', label: 'iOS' },
                { value: 'android', label: 'Android' },
              ]}
              onChange={(value) => setPlatform(value as AppPlatform)}
            />
          </Field>
          <Field label="Version" hint="As shown in the store, e.g. 1.4.0.">
            <Input
              value={version}
              autoFocus
              onChange={(event) => setVersion(event.target.value)}
              placeholder="1.4.0"
            />
          </Field>
        </>
      )}
      {/* Not a Field: its <label> would wrap the switch's own label and hint into one name. */}
      <div className="field">
        <Switch
          checked={mandatory}
          onChange={setMandatory}
          label="Mandatory update"
          describedBy={mandatoryHintId}
        />
        <span id={mandatoryHintId} className="field-hint">
          {mandatory
            ? 'On: users on any older version are blocked until they update.'
            : 'Off: users on an older version get a prompt they can dismiss.'}
        </span>
      </div>
      {becomesMandatory && (
        <p className="mandatory-confirm">
          <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
          Everyone on an older {platformLabel} version will be blocked. Add it only once this build
          is live on the {platformLabel} store, or they&apos;ll have nothing to install.
        </p>
      )}
      <Field label="Release notes" hint="Optional — for the team only, never shown in the app.">
        <textarea
          className="input"
          rows={3}
          maxLength={1000}
          value={releaseNotes}
          placeholder="Chat with your nanny during a booking."
          onChange={(event) => setReleaseNotes(event.target.value)}
        />
      </Field>
    </FormModal>
  );
}
