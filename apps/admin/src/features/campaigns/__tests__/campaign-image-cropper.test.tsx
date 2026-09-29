/**
 * react-easy-crop measures the DOM, which jsdom can't, so it's replaced by a
 * stub that reports one crop. Pinned: the frame is the banner's ratio, the
 * reported pixel area is what "Use image" hands back, and nothing can be
 * confirmed before an area exists.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CAMPAIGN_IMAGE_HEIGHT, CAMPAIGN_IMAGE_WIDTH } from '@nanny-app/shared';

import { CampaignImageCropper } from '@admin/features/campaigns/campaign-image-cropper';

const AREA = { x: 10, y: 20, width: 800, height: 450 };
const cropperProps = vi.fn();

vi.mock('react-easy-crop', () => ({
  default: (props: {
    aspect: number;
    zoom: number;
    onCropComplete: (area: typeof AREA, areaPixels: typeof AREA) => void;
  }) => {
    cropperProps(props);
    const { onCropComplete } = props;
    useEffect(() => onCropComplete(AREA, AREA), [onCropComplete]);
    return <div data-testid="easy-crop" />;
  },
}));

describe('CampaignImageCropper', () => {
  it('frames the banner ratio and confirms the chosen pixel area', async () => {
    const onConfirm = vi.fn();
    render(<CampaignImageCropper src="blob:pick" onCancel={vi.fn()} onConfirm={onConfirm} />);

    expect(cropperProps).toHaveBeenCalledWith(
      expect.objectContaining({ aspect: CAMPAIGN_IMAGE_WIDTH / CAMPAIGN_IMAGE_HEIGHT }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));
    expect(onConfirm).toHaveBeenCalledWith(AREA);
  });

  it('cancels without confirming', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<CampaignImageCropper src="blob:pick" onCancel={onCancel} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks both buttons while busy', () => {
    render(<CampaignImageCropper src="blob:pick" busy onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use image' })).toBeDisabled();
  });
});
