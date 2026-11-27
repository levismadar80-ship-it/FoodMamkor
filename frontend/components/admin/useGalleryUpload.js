// @ts-check
"use client";
/**
 * Module:   useGalleryUpload
 * Purpose:  Uploads the admin's picked gallery photos one by one and keeps
 *           every photo that made it, even when a later one fails; a failure
 *           stays on screen (how many, and why) until the next upload.
 * Touches:  POST /upload/image (Cloudinary, through the API).
 * Does NOT: save the business — the photos join the form, and «שמרו שינויים»
 *           (ProducerForm) writes them. Does not own the upload limit
 *           (backend/app/routers/upload.py, MEH-3906).
 * Related:  components/admin/ProducerForm.jsx (the images section).
 * History:  MEH-3915 (creation: a 429 mid-batch dropped the photos that had
 *           already uploaded, and the only sign was a passing toast).
 */
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

const RATE_LIMITED = 429;

/**
 * @param {(url: string) => void} addImage  appends one uploaded URL to the form
 */
export default function useGalleryUpload(addImage) {
  const t = useTranslations("admin");
  const tError = useTranslations("error");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(/** @type {string | null} */ (null));
  // A synchronous lock: a second pick before the re-render must not start a
  // second loop over the same form.
  const running = useRef(false);

  /** @param {File[]} files */
  const upload = async (files) => {
    if (!files.length || running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    let failed = 0;
    /** @type {string | null} */
    let reason = null;
    try {
      for (let i = 0; i < files.length; i += 1) {
        const fd = new FormData();
        fd.append("file", files[i]);
        try {
          const r = await api.post("/upload/image", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          // Added at once, not after the loop: a later failure keeps this one.
          addImage(r.data.url);
        } catch (err) {
          reason ??= errorMessage(err, tError);
          // Past the limit every remaining file would get the same answer.
          if (/** @type {any} */ (err)?.response?.status === RATE_LIMITED) {
            failed += files.length - i;
            break;
          }
          failed += 1;
        }
      }
      if (failed) {
        setFailure(
          t("producers.form.errors.images_failed", {
            failed,
            total: files.length,
            reason: reason ?? t("producers.form.errors.image_upload"),
          }),
        );
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return { upload, busy, failure };
}
