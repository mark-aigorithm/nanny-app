import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../confirm-dialog';
import { Modal } from '../modal';
import { Select } from '../select';

/** A page button that opens a modal, so focus has somewhere to come back to. */
function Harness({ children }: { children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">Before</button>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && children(() => setOpen(false))}
    </>
  );
}

describe('Modal', () => {
  it('pads its content itself — a consumer must not have to wrap children to get gutters', () => {
    render(
      <Modal title="Adjust Care Points" onClose={vi.fn()} footer={<button>Save</button>}>
        <form aria-label="points">
          <input aria-label="Points" />
        </form>
      </Modal>,
    );

    const body = screen.getByRole('form', { name: 'points' }).parentElement;
    expect(body).toHaveClass('modal-body');
    // The body sits between the header and the footer inside the dialog itself.
    expect(body?.parentElement).toBe(screen.getByRole('dialog'));
  });

  it('moves focus to the first field when it opens', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        {(close) => (
          <Modal title="Edit" onClose={close} footer={<button>Save</button>}>
            <input aria-label="Name" />
          </Modal>
        )}
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('lets a field with autoFocus keep the focus', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        {(close) => (
          <Modal title="Edit" onClose={close}>
            <input aria-label="First" />
            <input aria-label="Second" autoFocus />
          </Modal>
        )}
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus();
  });

  it('focuses the footer’s first button, then Close, when the body has nothing to focus', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Harness>
        {(close) => (
          <Modal title="Confirm" onClose={close} footer={<button>Cancel</button>}>
            <p>Sure?</p>
          </Modal>
        )}
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    unmount();

    render(
      <Harness>
        {(close) => (
          <Modal title="Answers" onClose={close}>
            <p>Read only</p>
          </Modal>
        )}
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        {(close) => (
          <Modal title="Edit" onClose={close} footer={<button>Save</button>}>
            <input aria-label="Name" />
          </Modal>
        )}
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });

    await user.tab(); // Name → Save
    expect(save).toHaveFocus();
    await user.tab(); // Save is last → wraps to Close
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // Close is first → wraps to Save
    expect(save).toHaveFocus();
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it('returns focus to the button that opened it', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        {(close) => (
          <Modal title="Edit" onClose={close}>
            <input aria-label="Name" />
          </Modal>
        )}
      </Harness>,
    );
    const open = screen.getByRole('button', { name: 'Open' });
    await user.click(open);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('lets only the topmost of stacked dialogs handle Escape', async () => {
    const user = userEvent.setup();
    function Stacked() {
      const [form, setForm] = useState(true);
      const [confirm, setConfirm] = useState(false);
      return (
        <>
          {form && (
            <Modal
              title="Add release"
              onClose={() => setForm(false)}
              footer={<button onClick={() => setConfirm(true)}>Add release</button>}
            >
              <input aria-label="Version" />
            </Modal>
          )}
          {confirm && (
            <ConfirmDialog
              title="Make mandatory?"
              message="Sure?"
              onConfirm={() => setConfirm(false)}
              onCancel={() => setConfirm(false)}
            />
          )}
        </>
      );
    }
    render(<Stacked />);
    await user.type(screen.getByRole('textbox', { name: 'Version' }), '1.5.0');
    await user.click(screen.getByRole('button', { name: 'Add release' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Version' })).toHaveValue('1.5.0');
    // Focus goes back into the form, onto the button that opened the confirm.
    expect(screen.getByRole('button', { name: 'Add release' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes an open dropdown on Escape without closing the dialog under it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Edit" onClose={onClose}>
        <Select
          aria-label="Platform"
          value="ios"
          options={[
            { value: 'ios', label: 'iOS' },
            { value: 'android', label: 'Android' },
          ]}
          onChange={vi.fn()}
        />
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'Platform' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a backdrop click when it is not dismissible', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal title="Pick" onClose={onClose} dismissible={false}>
        <p>Lots of ticks</p>
      </Modal>,
    );
    const backdrop = document.querySelector('.modal-backdrop');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Modal title="Pick" onClose={onClose}>
        <p>Nothing yet</p>
      </Modal>,
    );
    await user.click(document.querySelector('.modal-backdrop') as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
