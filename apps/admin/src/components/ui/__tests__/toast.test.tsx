/** Toasts: an action runs once and closes the toast; warnings carry their own tone. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '@admin/components/ui';

function Trigger({ onUse }: { onUse: () => void }) {
  const toast = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          toast.toast({ tone: 'success', title: 'Group created', action: { label: 'Use this group instead', onClick: onUse } })
        }
      >
        with action
      </button>
      <button type="button" onClick={() => toast.warning('Partly sent', '12 pushes failed')}>
        warning
      </button>
    </>
  );
}

describe('ToastProvider', () => {
  it('runs a toast action once and closes that toast', async () => {
    const onUse = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUse={onUse} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'with action' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this group instead' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Group created')).not.toBeInTheDocument();
  });

  it('shows a warning in the warning tone', async () => {
    render(
      <ToastProvider>
        <Trigger onUse={vi.fn()} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'warning' }));
    expect(screen.getByText('Partly sent').closest('.toast')).toHaveClass('toast--warning');
    expect(screen.getByText('12 pushes failed')).toBeInTheDocument();
  });
});
