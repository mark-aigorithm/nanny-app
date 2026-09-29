import { useCallback, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';

import { CAMPAIGN_IMAGE_HEIGHT, CAMPAIGN_IMAGE_WIDTH } from '@nanny-app/shared';

import { Button } from '@admin/components/ui';
import type { PixelArea } from '@admin/lib/crop-image';

const ASPECT = CAMPAIGN_IMAGE_WIDTH / CAMPAIGN_IMAGE_HEIGHT;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type CampaignImageCropperProps = {
  /** Object URL of the file the admin just picked. */
  src: string;
  /** Cropping/uploading in flight: the buttons lock. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (area: PixelArea) => void;
  /** The browser couldn't decode the picked file (HEIC in Chrome, a corrupt file). */
  onError: () => void;
};

/**
 * Frame a picked image to the Home-screen banner's shape. The frame is fixed at
 * the banner ratio; the admin pans and zooms the image under it, so what's
 * inside the frame is exactly what a mother sees on Home. Rendered inline in
 * the campaign form — a nested Modal would close the form on the same Escape.
 */
export function CampaignImageCropper({
  src,
  busy = false,
  onCancel,
  onConfirm,
  onError,
}: CampaignImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<PixelArea | null>(null);

  const handleCropComplete = useCallback((_: Area, areaPixels: Area) => setArea(areaPixels), []);

  return (
    <div className="crop-stage">
      <div
        className="crop-stage-frame"
        style={{ aspectRatio: `${CAMPAIGN_IMAGE_WIDTH} / ${CAMPAIGN_IMAGE_HEIGHT}` }}
      >
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={ASPECT}
          objectFit="cover"
          mediaProps={{ onError }}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>
      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(event) => setZoom(Number(event.target.value))}
        aria-label="Zoom"
        className="crop-stage-zoom"
        disabled={busy}
      />
      <div className="crop-stage-actions">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => area && onConfirm(area)}
          disabled={busy || area === null}
        >
          Use image
        </Button>
      </div>
    </div>
  );
}
