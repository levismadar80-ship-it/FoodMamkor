// @ts-check
/**
 * Module:   prepare-upload
 * Purpose:  Shrink a big phone photo in the browser before it is uploaded, so
 *           a business owner never meets «תמונה גדולה מדי» for an ordinary
 *           camera shot (3–8 MB). Long side 2000px, JPEG q 0.85.
 * Touches:  nothing outside the browser (canvas only).
 * Does NOT: enforce the 4 MB cap or show an error — that stays in
 *           lib/api.js + lib/upload-limits.js (MEH-3399) as the safety net.
 *           Never touches a GIF (may be animated), HEIC (most browsers cannot
 *           decode it; the server decides), a non-image, or a small file.
 * Related:  lib/api.js request interceptor (every FormData upload passes here);
 *           settings/page.jsx + ProductsSection.jsx call it before their own
 *           size check.
 * History:  MEH-3400 (creation). Big sites: Meta and Discourse resize in the
 *           browser before upload (card MEH-3400).
 */

/** Files at or under this size are sent untouched — no decode at all. */
export const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;
/** Longest side of the image that is sent, in px. */
export const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.85;
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
/**
 * Files already tried and kept as they were. The form calls prepareUpload and
 * the api.js interceptor calls it again on the same File — without this a big
 * photo that could not be shrunk would be decoded twice.
 * @type {WeakSet<Blob>}
 */
const kept = new WeakSet();

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ width: number, height: number }}
 */
export function fitWithin(w, h) {
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Return a smaller JPEG copy of `file` when it is a big photo, else `file`.
 * Any failure (no canvas, a decode error) returns the original, so the upload
 * still goes ahead and the existing 4 MB / 413 path decides.
 *
 * @template {Blob} T
 * @param {T} file
 * @returns {Promise<T | File>}
 */
export async function prepareUpload(file) {
  if (!file || !RESIZABLE.has(file.type) || file.size <= RESIZE_ABOVE_BYTES) return file;
  if (kept.has(file)) return file;
  const out = await shrink(file);
  if (out === file) kept.add(file);
  return out;
}

/**
 * @template {Blob} T
 * @param {T} file
 * @returns {Promise<T | File>}
 */
async function shrink(file) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap;
  try {
    // from-image: a portrait phone photo stays upright (EXIF orientation).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha: a transparent PNG gets a white ground, not black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    /** @type {Blob | null} */
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const base = "name" in file && typeof file.name === "string" ? file.name.replace(/\.[^.]+$/, "") : "image";
    return new File([blob], `${base || "image"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

/**
 * The same, for every file in a FormData. Returns the original object when
 * nothing changed, so a caller's FormData identity is kept in the common case.
 *
 * @param {FormData} data
 * @returns {Promise<FormData>}
 */
export async function prepareFormData(data) {
  const entries = [...data.entries()];
  const prepared = await Promise.all(
    entries.map(([, v]) => (typeof Blob !== "undefined" && v instanceof Blob ? prepareUpload(v) : v)),
  );
  if (prepared.every((v, i) => v === entries[i][1])) return data;
  const out = new FormData();
  entries.forEach(([k], i) => {
    const v = prepared[i];
    if (v instanceof File) out.append(k, v, v.name);
    else out.append(k, v);
  });
  return out;
}
