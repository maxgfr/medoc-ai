/** A photo of a box, made small: one copy for the model, a thumbnail. */
/** An image for the model. */
export interface ModelImage {
  data: Uint8Array;
  mediaType: string;
}

/** Long side sent to the model: enough to read small print on a box. */
const MODEL_SIDE = 1600;
const THUMB_SIDE = 320;

async function resize(bitmap: ImageBitmap, side: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot read images.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

export interface PreparedPhoto {
  model: ModelImage;
  thumbnail: Blob;
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [full, thumbnail] = await Promise.all([
      resize(bitmap, MODEL_SIDE, 0.85),
      resize(bitmap, THUMB_SIDE, 0.7),
    ]);
    return {
      model: { data: new Uint8Array(await full.arrayBuffer()), mediaType: "image/jpeg" },
      thumbnail,
    };
  } finally {
    bitmap.close();
  }
}
