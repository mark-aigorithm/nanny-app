import { useId, useState, type ReactNode } from 'react';

import { Button } from './button';
import { Modal } from './modal';

type PromptDialogProps = {
  title: string;
  message?: ReactNode;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
  required?: boolean;
  busy?: boolean;
  danger?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/** Modal text-entry dialog — the in-app replacement for window.prompt. */
export function PromptDialog({
  title,
  message,
  label,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Submit',
  multiline,
  required,
  busy,
  danger,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();
  const canSubmit = !busy && (!required || trimmed.length > 0);

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={!canSubmit}
            onClick={() => onSubmit(trimmed)}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="modal-text">{message}</p>}
      <div className="modal-field field">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {multiline ? (
          <textarea
            id={id}
            className="input"
            rows={3}
            placeholder={placeholder}
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input"
            placeholder={placeholder}
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
