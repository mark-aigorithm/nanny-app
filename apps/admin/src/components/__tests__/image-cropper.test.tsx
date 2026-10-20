/**
 * react-easy-crop measures the DOM, which jsdom can't, so it's replaced by a
 * stub that reports one crop. Pinned: the frame is the ratio of the size it is
 * given (the campaign banner, the 2:1 notification image), the reported pixel
 * area is what "Use image" hands back, and nothing can be confirmed before an
 * area exists.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CAMPAIGN_IMAGE_HEIGHT,
  CAMPAIGN_IMAGE_WIDTH,
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
} from '@nanny-app/shared';

import { ImageCropper } from '@admin/components/image-cropper';

const AREA = { x: 10, y: 20, width: 800, height: 450 };
const cropperProps = vi.fn();
// The stub reports a crop area on mount unless a test turns this off.
let reportArea = true;

function CropStub(props: {
  aspect: number;
  zoom: number;
  mediaProps: { onError: () => void };
  onCropComplete: (area: typeof AREA, areaPixels: typeof AREA) => void;
}) {
  cropperProps(props);
  const { onCropComplete } = props;
  useEffect(() => {
    if (reportArea) onCropComplete(AREA, AREA);
  }, [onCropComplete]);
  return <div data-testid="easy-crop" />;
}

vi.mock('react-easy-crop', () => ({ default: CropStub }));

beforeEach(() => {
  cropperProps.mockClear();
  reportArea = true;
});

function renderCropper(props: Partial<Parameters<typeof ImageCropper>[0]> = {}) {
  return render(
    <ImageCropper
      src="blob:pick"
      width={CAMPAIGN_IMAGE_WIDTH}
      height={CAMPAIGN_IMAGE_HEIGHT}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
      onError={vi.fn()}
      {...props}
    />,
  );
}

describe('ImageCropper', () => {
  it('frames the ratio it is given and confirms the chosen pixel area', async () => {
    const onConfirm = vi.fn();
    renderCropper({ onConfirm });
    expect(cropperProps).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect: CAMPAIGN_IMAGE_WIDTH / CAMPAIGN_IMAGE_HEIGHT,
        // The image fills the frame; 'contain' would shrink the frame to a tall image's width.
        objectFit: 'cover',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));
    expect(onConfirm).toHaveBeenCalledWith(AREA);
  });

  it('frames a notification image at 2:1', () => {
    renderCropper({ width: NOTIFICATION_IMAGE_WIDTH, height: NOTIFICATION_IMAGE_HEIGHT });
    expect(cropperProps).toHaveBeenCalledWith(expect.objectContaining({ aspect: 2 }));
  });

  it('cancels without confirming', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderCropper({ onCancel, onConfirm });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks both buttons while busy', () => {
    renderCropper({ busy: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use image' })).toBeDisabled();
  });

  it('cannot confirm before the cropper has reported an area', () => {
    reportArea = false;
    renderCropper();
    expect(screen.getByRole('button', { name: 'Use image' })).toBeDisabled();
  });

  it("passes the image-decode failure handler to the cropper's <img>", () => {
    const onError = vi.fn();
    renderCropper({ onError });
    const props = cropperProps.mock.calls[0]?.[0] as { mediaProps: { onError: () => void } };
    props.mediaProps.onError();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
