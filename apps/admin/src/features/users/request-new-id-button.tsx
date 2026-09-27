import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, PromptDialog, useToast } from '@admin/components/ui';
import { apiErrorMessage } from '@admin/lib/api-error';

type RequestNewIdButtonProps = {
  /** Whose ID it is, for the dialog and the toast. */
  name: string;
  /** What the suspension means for this role, appended to the warning. */
  consequence: string;
  request: (reason?: string) => Promise<unknown>;
  onDone: () => void;
};

/**
 * Sends a user's ID back for a new upload. The document is refused, not the
 * account: they return to "Awaiting ID" and the app asks them for a new one.
 */
export function RequestNewIdButton({ name, consequence, request, onDone }: RequestNewIdButtonProps) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (reason?: string) => request(reason),
    onSuccess: () => {
      setOpen(false);
      toast.success('New ID requested', `${name} will be asked to upload a new ID.`);
      onDone();
    },
    onError: (err) => toast.error('Couldn’t request a new ID', apiErrorMessage(err)),
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Request new ID
      </Button>
      {open && (
        <PromptDialog
          title="Request a new ID"
          message={`${name}'s ID photos will be deleted and they'll be asked to upload a new one. ${consequence}`}
          label="Reason (optional — shown to them)"
          placeholder="e.g. The photo is too blurry to read"
          confirmLabel="Delete ID and ask again"
          danger
          multiline
          busy={mutation.isPending}
          onSubmit={(reason) => mutation.mutate(reason || undefined)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
