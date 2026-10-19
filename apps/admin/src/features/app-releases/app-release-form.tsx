import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  CreateAppReleaseSchema,
  UpdateAppReleaseSchema,
  type AppPlatform,
  type AppRelease,
} from '@nanny-app/shared';

import { ConfirmDialog, Field, FormModal, Input, Select, Switch, useToast } from '@admin/components/ui';
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
  const [pendingSave, setPendingSave] = useState<(() => Promise<AppRelease>) | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AppRelease>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['app-releases'] });
      toast.success(release ? 'Release updated' : 'Release added', `${PLATFORM_LABELS[saved.platform]} ${saved.version}`);
      onClose();
    },
    onError: (err) => {
      setPendingSave(null);
      setFormError(apiErrorMessage(err));
    },
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
    // Turning "mandatory" on blocks every older install — make the admin confirm the build is live.
    const becomesMandatory = mandatory && !release?.mandatory;
    if (becomesMandatory) setPendingSave(() => save);
    else saveMutation.mutate(save);
  }

  return (
    <>
      <FormModal
        title={release ? `Edit ${PLATFORM_LABELS[release.platform]} ${release.version}` : 'Add release'}
        submitLabel={release ? 'Save changes' : 'Add release'}
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
        <Field
          label="Mandatory"
          hint="Users on an older build are blocked until they update. Otherwise they get a prompt they can dismiss."
        >
          <Switch checked={mandatory} onChange={setMandatory} label={mandatory ? 'Mandatory' : 'Optional'} />
        </Field>
        <Field label="Release notes" hint="Optional — shown in the app's update prompt.">
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

      {pendingSave && (
        <ConfirmDialog
          title="Make this release mandatory?"
          message={`Only make this mandatory once this build is live on the ${PLATFORM_LABELS[release?.platform ?? platform]} store — otherwise users will be blocked with nothing to install.`}
          confirmLabel="Make mandatory"
          busy={saveMutation.isPending}
          onConfirm={() => saveMutation.mutate(pendingSave)}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </>
  );
}
