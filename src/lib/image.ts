/** Client-side image prep for Screenshot to Shopping: decode, downscale to ~1024px JPEG, make a tiny thumbnail. */
export interface PreparedImage {
  /** data URL of the downscaled JPEG that is sent to the model */
  dataUrl: string;
  base64: string;
  mimeType: "image/jpeg";
  /** ~160px data URL kept in the chat history */
  thumb: string;
  width: number;
  height: number;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close(): void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src: CanvasImageSource, w: number, h: number, max: number, q: number): { url: string; w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; // flatten transparent PNG screenshots
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0, cw, ch);
  return { url: c.toDataURL("image/jpeg", q), w: cw, h: ch };
}

export async function prepareImage(file: File, max = 1024): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG, WebP or HEIC).");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That image is too large. Try one under 20 MB.");
  let d;
  try { d = await decode(file); } catch { throw new Error("I couldn't open that image. Try a JPG or PNG screenshot."); }
  try {
    const main = draw(d.src, d.w, d.h, max, 0.85);
    const thumb = draw(d.src, d.w, d.h, 160, 0.7);
    return { dataUrl: main.url, base64: main.url.slice(main.url.indexOf(",") + 1), mimeType: "image/jpeg", thumb: thumb.url, width: main.w, height: main.h };
  } finally { d.close(); }
}
