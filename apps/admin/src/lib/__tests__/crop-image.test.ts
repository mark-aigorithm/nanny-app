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
