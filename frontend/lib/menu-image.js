// @ts-check
/**
 * Module:   menu-image
 * Purpose:  Shrink a menu photo in the browser before it is sent (MEH-3430).
 *           A phone photo is 3–6 MB; Vercel's `/api` proxy refuses a body
 *           over ~4.5 MB (MEH-3399), and the model reads a 1600 px JPEG as
 *           well as the original (the accuracy test ran at that size).
 * Does NOT: touch a PDF, or fail: anything it cannot decode is returned as is
 *           and the server's magic-byte check decides.
 * History:  MEH-3430 (creation).
 */

/** Longest side, px. */
const MENU_MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function shrinkMenuImage(file) {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MENU_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    /** @type {Blob | null} */
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
