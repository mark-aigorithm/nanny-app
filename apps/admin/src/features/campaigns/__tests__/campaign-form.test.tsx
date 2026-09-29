/**
 * A picked campaign image is never uploaded as-is: the admin frames it to the
 * Home banner shape first, and only the cropped 1200×675 JPEG goes up.
 * Cancelling the crop uploads nothing and keeps the form's current image.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CAMPAIGN_IMAGE_HEIGHT, CAMPAIGN_IMAGE_WIDTH } from '@nanny-app/shared';

import { ToastProvider } from '@admin/components/ui';
import { CampaignFormModal } from '@admin/features/campaigns/campaign-form';
import { cropImageToFile } from '@admin/lib/crop-image';
import { uploadImageToFirebase } from '@admin/lib/storage';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const AREA = { x: 10, y: 20, width: 800, height: 450 };
const CROPPED = new File(['jpeg'], 'banner.jpg', { type: 'image/jpeg' });

vi.mock('@admin/lib/storage', () => ({
  uploadImageToFirebase: vi.fn().mockResolvedValue('https://cdn.example/cropped.jpg'),
}));

vi.mock('@admin/lib/crop-image', () => ({
  cropImageToFile: vi.fn(),
}));

vi.mock('@admin/features/campaigns/campaign-image-cropper', () => ({
  CampaignImageCropper: ({
    onCancel,
    onConfirm,
  }: {
    onCancel: () => void;
    onConfirm: (area: typeof AREA) => void;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>
        Cancel crop
      </button>
      <button type="button" onClick={() => onConfirm(AREA)}>
        Use image
      </button>
    </div>
  ),
}));

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

beforeEach(() => {
  vi.mocked(cropImageToFile).mockReset().mockResolvedValue(CROPPED);
  vi.mocked(uploadImageToFirebase).mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:picked');
  URL.revokeObjectURL = vi.fn();
  server.use(
    http.get('/api/admin/packages', () => ok([])),
    http.get('/api/admin/promo-codes', () => ok([])),
  );
});

function renderForm() {
  renderWithProviders(
    <ToastProvider>
      <CampaignFormModal onClose={vi.fn()} />
    </ToastProvider>,
  );
}

async function pickFile() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not rendered');
  await userEvent.upload(input, new File(['png'], 'banner.png', { type: 'image/png' }));
}

describe('CampaignFormModal image', () => {
  it('crops the picked file to the banner size before uploading it', async () => {
    renderForm();
    await pickFile();

    expect(uploadImageToFirebase).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));

    await waitFor(() => expect(uploadImageToFirebase).toHaveBeenCalledWith(CROPPED, 'campaigns'));
    expect(cropImageToFile).toHaveBeenCalledWith(
      'blob:picked',
      AREA,
      CAMPAIGN_IMAGE_WIDTH,
      CAMPAIGN_IMAGE_HEIGHT,
      'banner.png',
    );
    expect(await screen.findByAltText('Campaign preview')).toHaveAttribute(
      'src',
      'https://cdn.example/cropped.jpg',
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picked');
  });

  it('uploads nothing when the crop is cancelled', async () => {
    renderForm();
    await pickFile();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel crop' }));

    expect(uploadImageToFirebase).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picked');
  });

  it("shows an error and uploads nothing when the image can't be read", async () => {
    vi.mocked(cropImageToFile).mockRejectedValue(new Error("Couldn't read that image."));
    renderForm();
    await pickFile();

    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));

    expect(await screen.findByText("Couldn't read that image.")).toBeInTheDocument();
    expect(uploadImageToFirebase).not.toHaveBeenCalled();
  });
});
