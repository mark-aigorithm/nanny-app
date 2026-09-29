# Admin Campaign Image Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin picks a campaign image, they crop it interactively to the mother's Home-screen banner shape (1200 × 675) before it is uploaded.

**Architecture:** A pure canvas helper (`cropImageToFile`) turns a chosen pixel area into a 1200 × 675 JPEG `File`. A `CampaignImageCropper` component wraps `react-easy-crop` with a fixed 16:9 frame, a zoom slider and Cancel / Use image buttons. `CampaignFormModal` shows the cropper inline (not a nested modal) after a file is picked, then crops → uploads through the existing `uploadImageToFirebase`.

**Tech Stack:** React 19 + Vite admin app, `react-easy-crop@^6`, Vitest + Testing Library + MSW, canvas API.

Spec: `docs/superpowers/specs/2026-09-29-admin-campaign-image-crop-design.md`

## Global Constraints

- Output size is `CAMPAIGN_IMAGE_WIDTH × CAMPAIGN_IMAGE_HEIGHT` from `@nanny-app/shared` (1200 × 675) — never hard-code the numbers.
- Output is `image/jpeg`, quality `0.9`, file name ends in `.jpg`; transparent areas are filled white.
- The cropper renders **inline** in the form — never inside a second `Modal` (each `Modal` listens for Escape on `document`, so a nested one closes both).
- Cropper buttons use the admin `Button` (defaults to `type="button"`) so they never submit the form.
- No `any`. `import type` for type-only imports. Files kebab-case.
- All commands run from `apps/admin`. ESLint is broken repo-wide — verify with `pnpm typecheck` and `pnpm vitest run`.
- Decode failure message: `Couldn't read that image.`
- Image hint copy: `You'll crop it to the Home-screen banner shape (16:9).` (prefixed by the existing "Upload to replace the current image." / "Required.")

---

### Task 1: `cropImageToFile` canvas helper

**Files:**
- Create: `apps/admin/src/lib/crop-image.ts`
- Test: `apps/admin/src/lib/__tests__/crop-image.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PixelArea = { x: number; y: number; width: number; height: number };
  export function cropImageToFile(
    src: string, area: PixelArea, width: number, height: number, name: string,
  ): Promise<File>;
  ```
  Rejects with `Error("Couldn't read that image.")` if the image fails to load, the 2D context is unavailable, or `toBlob` yields null.

- [ ] **Step 1: Write the failing test**

`apps/admin/src/lib/__tests__/crop-image.test.ts`:

```ts
/**
 * jsdom has no canvas, so the canvas and Image are stubbed. What is pinned is
 * the contract the campaign form relies on: the chosen source area is drawn
 * to exactly the requested output size, as a JPEG named after the pick.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cropImageToFile } from '@admin/lib/crop-image';

let loads = true;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
  }
}

const ctx = {
  fillStyle: '',
  imageSmoothingQuality: 'low',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
};

beforeEach(() => {
  loads = true;
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ctx.fillRect.mockClear();
  ctx.drawImage.mockClear();
});

describe('cropImageToFile', () => {
  it('draws the chosen area at the output size and returns a JPEG file', async () => {
    const file = await cropImageToFile(
      'blob:source',
      { x: 10, y: 20, width: 800, height: 450 },
      1200,
      675,
      'summer-sale.png',
    );

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1200, 675);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      expect.any(FakeImage),
      10, 20, 800, 450,
      0, 0, 1200, 675,
    );
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.9,
    );
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('summer-sale.jpg');
  });

  it("rejects when the image can't be decoded", async () => {
    loads = false;
    await expect(
      cropImageToFile('blob:bad', { x: 0, y: 0, width: 1, height: 1 }, 1200, 675, 'x.png'),
    ).rejects.toThrow("Couldn't read that image.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/crop-image.test.ts`
Expected: FAIL — cannot resolve `@admin/lib/crop-image`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/lib/crop-image.ts`:

```ts
/** A rectangle in the source image's own pixels, as react-easy-crop reports it. */
export type PixelArea = { x: number; y: number; width: number; height: number };

const READ_ERROR = "Couldn't read that image.";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(READ_ERROR));
    image.src = src;
  });
}

/**
 * Draw `area` of the image at `src` onto a `width × height` canvas and return
 * it as a JPEG File named after `name`. The output is always exactly the
 * requested size, so whatever shows it at that ratio never crops it again.
 * Transparent pixels are flattened onto white (JPEG has no alpha).
 */
export async function cropImageToFile(
  src: string,
  area: PixelArea,
  width: number,
  height: number,
  name: string,
): Promise<File> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(READ_ERROR);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob) throw new Error(READ_ERROR);

  const base = name.replace(/\.[^.]+$/, '') || 'campaign';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/crop-image.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crop-image.ts src/lib/__tests__/crop-image.test.ts
git commit -m "feat(admin): canvas helper to crop an image to a fixed size"
```

---

### Task 2: `CampaignImageCropper` component

**Files:**
- Modify: `apps/admin/package.json` (add `react-easy-crop`)
- Create: `apps/admin/src/features/campaigns/campaign-image-cropper.tsx`
- Modify: `apps/admin/src/styles/global.css` (append crop-stage styles)
- Test: `apps/admin/src/features/campaigns/__tests__/campaign-image-cropper.test.tsx`

**Interfaces:**
- Consumes: `PixelArea` from `@admin/lib/crop-image` (Task 1).
- Produces:
  ```ts
  type CampaignImageCropperProps = {
    src: string;            // object URL of the picked file
    busy?: boolean;         // cropping/uploading in flight: buttons lock
    onCancel: () => void;
    onConfirm: (area: PixelArea) => void;
  };
  export function CampaignImageCropper(props: CampaignImageCropperProps): JSX.Element;
  ```
  Buttons are labelled exactly `Cancel` and `Use image`; the zoom slider has `aria-label="Zoom"`.

- [ ] **Step 1: Install the dependency**

Run: `pnpm add react-easy-crop@^6.2.3`
Expected: `apps/admin/package.json` gains `"react-easy-crop": "^6.2.3"`; lockfile updated.

- [ ] **Step 2: Write the failing test**

`apps/admin/src/features/campaigns/__tests__/campaign-image-cropper.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/features/campaigns/__tests__/campaign-image-cropper.test.tsx`
Expected: FAIL — cannot resolve `@admin/features/campaigns/campaign-image-cropper`.

- [ ] **Step 4: Write the component**

`apps/admin/src/features/campaigns/campaign-image-cropper.tsx`:

```tsx
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
}: CampaignImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<PixelArea | null>(null);

  const handleCropComplete = useCallback((_: Area, areaPixels: Area) => setArea(areaPixels), []);

  return (
    <div className="crop-stage">
      <div className="crop-stage-frame">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={ASPECT}
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
```

- [ ] **Step 5: Add the crop-stage styles**

Append to `apps/admin/src/styles/global.css` (react-easy-crop needs a positioned parent with a real height; the frame box uses the banner ratio so the crop area fills it):

```css
/* Campaign image cropper — inline in the campaign form. */
.crop-stage {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.crop-stage-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #1f1f1f;
}

.crop-stage-zoom {
  width: 100%;
}

.crop-stage-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/features/campaigns/__tests__/campaign-image-cropper.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json ../../pnpm-lock.yaml src/features/campaigns/campaign-image-cropper.tsx src/features/campaigns/__tests__/campaign-image-cropper.test.tsx src/styles/global.css
git commit -m "feat(admin): campaign image cropper at the Home banner ratio"
```

---

### Task 3: Wire the cropper into the campaign form

**Files:**
- Modify: `apps/admin/src/features/campaigns/campaign-form.tsx`
- Test: `apps/admin/src/features/campaigns/__tests__/campaign-form.test.tsx`

**Interfaces:**
- Consumes: `cropImageToFile(src, area, width, height, name): Promise<File>` and `PixelArea` (Task 1); `CampaignImageCropper({ src, busy, onCancel, onConfirm })` (Task 2); existing `uploadImageToFirebase(file: File, folder: string): Promise<string>` from `@admin/lib/storage`.
- Produces: no new exports; `CampaignFormModal` behaviour changes only.

- [ ] **Step 1: Write the failing test**

`apps/admin/src/features/campaigns/__tests__/campaign-form.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/campaigns/__tests__/campaign-form.test.tsx`
Expected: FAIL — the first test sees `uploadImageToFirebase` called straight after the pick (and no "Use image" button).

- [ ] **Step 3: Wire the cropper into the form**

In `apps/admin/src/features/campaigns/campaign-form.tsx`:

(a) Add imports next to the existing ones:

```tsx
import { CampaignImageCropper } from '@admin/features/campaigns/campaign-image-cropper';
import { cropImageToFile, type PixelArea } from '@admin/lib/crop-image';
```

(b) Below `const [uploading, setUploading] = useState(false);` add:

```tsx
  // A picked file waiting to be framed: its object URL and original name.
  const [pending, setPending] = useState<{ src: string; name: string } | null>(null);
```

(c) Replace the whole `handleImage` function with these three:

```tsx
  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    setFormError(null);
    setPending({ src: URL.createObjectURL(file), name: file.name });
  }

  function discardPending() {
    if (pending) URL.revokeObjectURL(pending.src);
    setPending(null);
  }

  async function handleCropConfirm(area: PixelArea) {
    if (!pending) return;
    setUploading(true);
    setFormError(null);
    try {
      const file = await cropImageToFile(
        pending.src,
        area,
        CAMPAIGN_IMAGE_WIDTH,
        CAMPAIGN_IMAGE_HEIGHT,
        pending.name,
      );
      const url = await uploadImageToFirebase(file, 'campaigns');
      setImageUrl(url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      discardPending();
    }
  }
```

(d) In the `<FormModal …>` props, change `submitDisabled` to also block while a crop is pending:

```tsx
      submitDisabled={uploading || pending !== null || !imageUrl || title.trim() === ''}
```

(e) Replace the Image `<Field>` block with:

```tsx
        <Field
          label="Image"
          hint={`${campaign ? 'Upload to replace the current image.' : 'Required.'} You'll crop it to the Home-screen banner shape (16:9).`}
        >
          {pending ? (
            <CampaignImageCropper
              src={pending.src}
              busy={uploading}
              onCancel={discardPending}
              onConfirm={(area) => void handleCropConfirm(area)}
            />
          ) : (
            <Input type="file" accept="image/*" onChange={handleImage} />
          )}
        </Field>
```

Leave the preview block unchanged (its fixed-ratio `objectFit: 'cover'` still shows older, uncropped images the way the app does).

- [ ] **Step 4: Run the campaign tests to verify they pass**

Run: `pnpm vitest run src/features/campaigns`
Expected: PASS (6 tests across the two files).

- [ ] **Step 5: Typecheck and run the whole admin unit suite**

Run: `pnpm typecheck && pnpm vitest run`
Expected: typecheck exits 0; all admin tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/campaigns/campaign-form.tsx src/features/campaigns/__tests__/campaign-form.test.tsx
git commit -m "feat(admin): crop campaign images to the Home banner before upload"
```

---

### Task 4: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1:** Start the admin dev server (`.claude/launch.json` entry, or add one: `pnpm --filter=@nanny-app/admin dev`, port 5173) and open Campaigns → Add campaign.
- [ ] **Step 2:** Pick a non-16:9 image (e.g. a tall phone screenshot). Confirm the inline cropper shows a 16:9 frame, drag pans, the slider and wheel zoom, and the form's Add button is disabled while cropping.
- [ ] **Step 3:** Without a signed-in Firebase user the upload will fail at `uploadImageToFirebase`; to check the crop output itself, run in the page console on the picked image's object URL: `await (await import('/src/lib/crop-image.ts')).cropImageToFile(<blob url>, {x:0,y:0,width:400,height:225}, 1200, 675, 'a.png')` and confirm `createImageBitmap(file)` reports `1200 × 675`. If signed in against a dev project, confirm the uploaded object's dimensions instead.
- [ ] **Step 4:** Press Escape while the cropper is open — the form closes once (expected, same as any field); re-open and Cancel the crop — the file input returns and nothing uploads.
- [ ] **Step 5:** Screenshot the cropper for the PR.
