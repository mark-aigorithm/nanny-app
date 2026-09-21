import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '../modal';

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
});
