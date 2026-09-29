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
