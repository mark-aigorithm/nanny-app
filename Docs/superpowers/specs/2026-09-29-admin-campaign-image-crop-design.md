# Admin campaign image crop — design

## Problem

The mother's Home screen draws each campaign banner in a fixed 16:9 frame
(`CAMPAIGN_IMAGE_WIDTH × CAMPAIGN_IMAGE_HEIGHT`, 1200 × 675, from `packages/shared/src/campaign.ts`).
An image of any other shape is centre-cropped by the app (`Image` default `resizeMode="cover"`),
so the admin can't choose which part of the artwork survives. The admin form only warns about
this in a hint.

## Goal

When an admin picks a campaign image, they crop it interactively to exactly the banner shape
before it is uploaded. What they see in the cropper is what the mother sees on Home.

## Design

**Flow.** Admin picks a file → an inline crop stage replaces the Image field's file input: the
image under a fixed 16:9 frame (drag to pan, wheel/pinch or a zoom slider to zoom), with
**Cancel** and **Use image** buttons → on **Use image** the selected area is drawn to a
1200 × 675 canvas, exported as JPEG (quality 0.9), wrapped in a `File`, and uploaded through the
existing `uploadImageToFirebase(file, 'campaigns')`. **Cancel** discards the pick and keeps
the current image.

**Inline, not a nested modal.** The campaign form is already a `Modal`; every `Modal` registers
its own `document` Escape listener, so a second modal on top would close both on one Escape.
The crop stage renders inside the form instead.

**Library.** `react-easy-crop` (≈10 kB, no deps, touch + wheel + drag, fixed `aspect`). It
reports the chosen area in source pixels (`croppedAreaPixels`), which the canvas step consumes.

### Units

| Unit | Responsibility |
|---|---|
| `apps/admin/src/lib/crop-image.ts` | `cropImageToFile(src, area, width, height, name)` — loads the image, draws `area` scaled to `width × height` on a canvas, returns a JPEG `File`. No React. |
| `apps/admin/src/features/campaigns/campaign-image-cropper.tsx` | `CampaignImageCropper({ src, onCancel, onConfirm(area) })` — the crop stage: `react-easy-crop` at `aspect = W/H`, zoom slider, Cancel / Use image (`type="button"`, so they never submit the form). |
| `apps/admin/src/features/campaigns/campaign-form.tsx` | Holds the picked file's object URL; shows the cropper while one is pending; on confirm crops → uploads → sets `imageUrl`; revokes the object URL; resets the file input so re-picking the same file works. Submit stays disabled while cropping or uploading. |

### Copy and preview

- Image hint: "You'll crop it to the Home-screen banner shape (16:9)."
- The preview keeps its fixed aspect frame (older, uncropped images still display as the app
  shows them) — no behaviour change there.

### Out of scope

- Re-cropping an already-uploaded image: drawing a Firebase Storage URL to a canvas needs CORS
  on the bucket. To change the crop, pick the file again.
- Any mobile change — the app already renders at the upload ratio.

## Error handling

- Image fails to decode in the canvas step → form error "Couldn't read that image", no upload.
- Upload failure → existing form-error path.

## Testing

- Vitest (`campaign-form` test): pick a file → crop stage appears → **Use image** →
  `uploadImageToFirebase` is called with a `image/jpeg` `File`; **Cancel** → no upload, file
  input shown again. `react-easy-crop` and `cropImageToFile` are mocked (jsdom has no canvas).
- Manual browser check against the dev admin: the uploaded object is 1200 × 675 and matches the
  framed area.
