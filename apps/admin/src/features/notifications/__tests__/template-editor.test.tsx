/**
 * Writing a notification template: content with live character counts, a
 * cropped image, channel, link and audience, saved in one request. Problems
 * show beside their field once it is left, and a failed Save focuses a summary
 * that links to each one.
 */
import type { AdminUser, NotificationTemplate } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { TemplateEditor } from '@admin/features/notifications/template-editor';
import { cropImageToFile } from '@admin/lib/crop-image';
import { PermissionsProvider } from '@admin/lib/permissions';
import { uploadImageToFirebase } from '@admin/lib/storage';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

import { ADMIN, TEMPLATE, VIEWER, editorHandlers, ok } from './fixtures';

const AREA = { x: 0, y: 0, width: 1024, height: 512 };
const CROPPED = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' });

vi.mock('@admin/lib/storage', () => ({
  uploadImageToFirebase: vi.fn().mockResolvedValue('https://cdn.example/n.jpg'),
}));
vi.mock('@admin/lib/crop-image', () => ({ cropImageToFile: vi.fn() }));
vi.mock('@admin/components/image-cropper', () => ({
  ImageCropper: ({ onConfirm }: { onConfirm: (area: typeof AREA) => void }) => (
    <button type="button" onClick={() => onConfirm(AREA)}>
      Use image
    </button>
  ),
}));

beforeEach(() => {
  vi.mocked(cropImageToFile).mockReset().mockResolvedValue(CROPPED);
  vi.mocked(uploadImageToFirebase).mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:picked');
  URL.revokeObjectURL = vi.fn();
});

function renderEditor({ template, me = ADMIN }: { template?: NotificationTemplate; me?: AdminUser } = {}) {
  server.use(http.get('/api/admin/me', () => ok(me)), ...editorHandlers);
  // A data router, as the app uses: the unsaved-changes guard needs useBlocker.
  const router = createMemoryRouter(
    [
      { path: '/notifications/new', element: <TemplateEditor /> },
      { path: '/notifications/12', element: <p>Template 12 open</p> },
      { path: '/notifications/:id', element: <TemplateEditor template={template} /> },
      { path: '/notifications', element: <p>Notification list</p> },
    ],
    { initialEntries: [template ? `/notifications/${template.id}` : '/notifications/new'] },
  );
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

const saveButton = () => screen.getByRole('button', { name: /^save$/i });

describe('TemplateEditor', () => {
  it('keeps the page heading on the saved name while the name field is edited', async () => {
    renderEditor({ template: TEMPLATE });
    await userEvent.type(await screen.findByLabelText('Name'), ' v2');
    expect(screen.getByRole('heading', { name: 'Win-back 30d' })).toBeInTheDocument();
  });

  it('heads a new template "Create new notification"', async () => {
    renderEditor();
    await userEvent.type(await screen.findByLabelText('Name'), 'Win-back');
    expect(screen.getByRole('heading', { name: 'Create new notification' })).toBeInTheDocument();
  });

  it('creates the template on its first Save, says Saved, and opens it at its own URL', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/notification-templates', async ({ request }) => {
        body = await request.json();
        return ok({ ...TEMPLATE, id: 12 });
      }),
    );
    renderEditor();

    await userEvent.type(await screen.findByLabelText('Name'), 'Win-back 30d');
    await userEvent.type(screen.getByLabelText('Title'), 'We miss you');
    await userEvent.type(screen.getByLabelText('Message'), 'Book this week and save 20%.');
    await userEvent.click(await screen.findByRole('checkbox', { name: /lapsed 30d/i }));
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(body).toEqual({
        name: 'Win-back 30d',
        title: 'We miss you',
        body: 'Book this week and save 20%.',
        imageUrl: null,
        channel: 'BOTH',
        targetType: null,
        packageId: null,
        promoCodeId: null,
        audience: { type: 'GROUPS', groupIds: [2] },
      }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(await screen.findByText('Template 12 open')).toBeInTheDocument();
  });

  it('on a failed Save, focuses a summary that links to each problem, and sends nothing', async () => {
    let posted = false;
    server.use(
      http.post('/api/admin/notification-templates', () => {
        posted = true;
        return ok(TEMPLATE);
      }),
    );
    renderEditor();

    await userEvent.click(await screen.findByRole('button', { name: /^save$/i }));
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole('heading', { name: 'Fix 4 problems before saving' })).toBeInTheDocument();
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Give the template a name.',
      'Write a title.',
      'Write the message.',
      'Choose at least one group.',
    ]);

    await userEvent.click(within(summary).getByRole('link', { name: 'Write a title.' }));
    const title = screen.getByLabelText('Title');
    expect(title).toHaveFocus();
    // The inline error stays beside the field too.
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(false);
  });

  it("shows a field's problem once it is left, linked to the field", async () => {
    renderEditor();
    const name = await screen.findByLabelText('Name');
    await userEvent.click(name);
    await userEvent.tab();

    const error = screen.getByText('Give the template a name.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.getAttribute('aria-describedby')).toContain(error.id);
    // The title has not been left yet, so it says nothing.
    expect(screen.queryByText('Write a title.')).not.toBeInTheDocument();
  });

  it('counts characters and turns the counter to a warning near the limit', async () => {
    renderEditor();
    const title = await screen.findByLabelText('Title');
    expect(screen.getByText('0 / 65')).toBeInTheDocument();
    expect(title).toHaveAttribute('maxlength', '65');

    await userEvent.click(title);
    await userEvent.paste('x'.repeat(60));
    const counter = screen.getByText(/^60 \/ 65/);
    expect(counter).toHaveTextContent('60 / 65 · 5 left');
    expect(counter).toHaveClass('char-counter--warn');
  });

  it('links to a package instead of the promo code', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/notification-templates/4', async ({ request }) => {
        body = await request.json();
        return ok(TEMPLATE);
      }),
    );
    renderEditor({ template: TEMPLATE });

    await userEvent.click(await screen.findByRole('radio', { name: 'A package' }));
    await userEvent.click(screen.getByRole('button', { name: 'Linked package' }));
    await userEvent.click(await screen.findByRole('option', { name: '10 hours' }));
    expect(screen.getByText(/Mothers who tap it land on the 10 hours package, ready to buy/)).toBeInTheDocument();
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(body).toMatchObject({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null }),
    );
  });

  it('sends a mother to Home when nothing else is chosen', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/notification-templates/4', async ({ request }) => {
        body = await request.json();
        return ok(TEMPLATE);
      }),
    );
    renderEditor({ template: TEMPLATE });

    expect(await screen.findByRole('heading', { name: 'Tapping it opens' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Home' }));
    expect(screen.getByText('Mothers who tap it land on the Home screen.')).toBeInTheDocument();
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(body).toMatchObject({ targetType: null, packageId: null, promoCodeId: null }),
    );
  });

  it('crops a picked image to 1024 × 512 and uploads it to the notifications folder', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/notification-templates/4', async ({ request }) => {
        body = await request.json();
        return ok(TEMPLATE);
      }),
    );
    renderEditor({ template: TEMPLATE });

    await userEvent.upload(
      await screen.findByLabelText('Image'),
      new File(['png'], 'photo.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));

    await waitFor(() => expect(uploadImageToFirebase).toHaveBeenCalledWith(CROPPED, 'notifications'));
    expect(cropImageToFile).toHaveBeenCalledWith('blob:picked', AREA, 1024, 512, 'photo.png');
    expect(await screen.findByRole('button', { name: 'Remove image' })).toBeInTheDocument();
    await userEvent.click(saveButton());
    await waitFor(() => expect(body).toMatchObject({ imageUrl: 'https://cdn.example/n.jpg' }));
  });

  it('asks before leaving with unsaved changes; Stay keeps them, Leave goes', async () => {
    renderEditor({ template: TEMPLATE });
    await userEvent.type(await screen.findByLabelText('Title'), '!');

    await userEvent.click(screen.getByRole('button', { name: 'Notification Center' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Title')).toHaveValue('We miss you!');

    await userEvent.click(screen.getByRole('button', { name: 'Notification Center' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Notification list')).toBeInTheDocument();
  });

  it('locks the link and audience pickers while a save is in flight, and unlocks if it fails', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch('/api/admin/notification-templates/4', async () => {
        await gate;
        // A failed save keeps the editor open, so the unlock is visible.
        return HttpResponse.json({ data: null, error: 'Database unavailable' }, { status: 503 });
      }),
    );
    renderEditor({ template: TEMPLATE });
    await userEvent.type(await screen.findByLabelText('Title'), '!');
    const checkbox = await screen.findByRole('checkbox', { name: /lapsed 30d/i });
    await userEvent.click(saveButton());

    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(screen.getByRole('radio', { name: 'A package' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Linked promo code' })).toBeDisabled();

    release();
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(screen.getByRole('radio', { name: 'A package' })).toBeEnabled();
  });

  it('is read-only for a view-only operator', async () => {
    renderEditor({ template: TEMPLATE, me: VIEWER });
    expect(await screen.findByLabelText('Title')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Image')).not.toBeInTheDocument();
    // The audience and link by name, without the controls that change them.
    expect(screen.getByText('Lapsed 30d')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('A booking with code SAVE20 applied')).toBeInTheDocument();
  });
});
