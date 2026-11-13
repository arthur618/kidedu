export function fitImage(width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function cropBox(box: [number, number, number, number], width: number, height: number) {
  const x = Math.max(0, Math.min(1, box[0]));
  const y = Math.max(0, Math.min(1, box[1]));
  return { x: x * width, y: y * height, width: Math.max(0, Math.min(box[2], 1 - x)) * width, height: Math.max(0, Math.min(box[3], 1 - y)) * height };
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("image_only");
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    Object.assign(canvas, fitImage(image.naturalWidth, image.naturalHeight));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if ((result.length - result.indexOf(",") - 1) * 0.75 <= 2 * 1024 * 1024) return result;
    }
    throw new Error("image_too_large");
  } finally { URL.revokeObjectURL(url); }
}
export async function cropPhoto(src: string, box: [number, number, number, number]): Promise<string> {
  const image = await loadImage(src);
  const crop = cropBox(box, image.naturalWidth, image.naturalHeight);
  if (crop.width <= 0 || crop.height <= 0) return src;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width)); canvas.height = Math.max(1, Math.round(crop.height));
  const context = canvas.getContext("2d");
  if (!context) return src;
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
