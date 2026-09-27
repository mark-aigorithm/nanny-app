import { useId, type ReactNode } from 'react';

import { Button } from './button';
import { Feedback } from './feedback';
import { Modal } from './modal';

type FormModalProps = {
  title: string;
  /** The submit button's label, e.g. "Add skill" or "Save changes". */
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  /** A save is in flight: the buttons lock and the submit label reads "Saving…". */
  busy?: boolean;
  /** Blocks submitting, e.g. while a required field is empty. */
  submitDisabled?: boolean;
  /** Validation or server error, shown under the fields. */
  error?: string | null;
  size?: 'sm' | 'md';
  children: ReactNode;
};

/**
 * The one create/edit dialog for a table page: the fields go in as children,
 * and Enter or the footer button submits them. The same modal serves "Add …"
 * (opened from the page header) and "Edit" (opened from a row's action menu),
 * so an entity's form is written once.
 */
export function FormModal({
  title,
  submitLabel,
  onSubmit,
  onClose,
  busy = false,
  submitDisabled = false,
  error,
  size = 'md',
  children,
}: FormModalProps) {
  const formId = useId();
  return (
    <Modal
      title={title}
      size={size}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={busy || submitDisabled}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !submitDisabled) onSubmit();
        }}
      >
        {children}
        {error && <Feedback tone="error">{error}</Feedback>}
      </form>
    </Modal>
  );
}
