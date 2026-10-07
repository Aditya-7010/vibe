/**
 * Shrinks an image file down to a small JPEG data URL before it's sent
 * anywhere. Images here are stored directly in the database as base64
 * (see the backend model comments for why — no persistent disk to put
 * uploaded files on), so keeping them small matters a lot more than it
 * would for a normal file upload.
 */
export async function compressImageFile(
  file: File,
  { maxDimension = 800, quality = 0.72 }: { maxDimension?: number; quality?: number } = {},
): Promise<string> {
  const original = await readFileAsDataURL(file);
  const img = await loadImage(original);

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original; // fall back to the uncompressed image rather than fail outright
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
