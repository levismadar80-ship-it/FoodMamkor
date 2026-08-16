"use client";

/**
 * Module:   use-reject-flow
 * Purpose:  Controller for the admin reject composer — fetches the canonical
 *           preset reasons, holds the modal's four pieces of state, and POSTs
 *           the rejection.
 * Touches:  GET /admin/producers/rejection-presets · POST
 *           /admin/producers/{id}/reject (which emails the business owner).
 * Does NOT: own the preset LABELS, and does NOT own the busy registry — `run`
 *           is passed in from use-admin-producers so a reject shares one
 *           in-flight guard with approve / delete / toggle on the same row.
 * Related:  ./use-admin-producers.js (composes this) · ./RejectModal.jsx (the
 *           view) · backend admin.py::PRODUCER_REJECTION_PRESETS (the labels) ·
 *           __tests__/AdminProducerReject.test.jsx
 * History:  MEH-226 (creation). Split out of use-admin-producers.js rather
 *           than added to it: inline, that file crossed the 250-line cap.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

// Sub-hook 2b — MEH-226 reject flow (kebab item -> modal -> confirm -> POST).
//
// Its own sub-hook rather than more lines inside useProducerActions: that
// function is already at the `max-lines-per-function` ceiling, and the reject
// flow carries four pieces of state of its own. REUSES the request-changes
// controller shape above (open/close/submit + a `run` busy key) so page.js
// wires this modal exactly like the other one.
//
// The preset LABELS are fetched, never hardcoded. The backend composes the
// persisted reason and the owner's email from the same dict
// (admin.py::PRODUCER_REJECTION_PRESETS), so a local copy here would be a
// second owner of one fact and could disagree with the email (Smell #1).
export function useRejectFlow(loadAllProducers, run) {
  const t = useTranslations("admin");
  const tError = useTranslations("error");

  const [rejectProducer, setRejectProducer] = useState(null); // null = closed
  const [presets, setPresets] = useState([]);
  const [presetsError, setPresetsError] = useState(false);
  const [presetKey, setPresetKey] = useState("");
  const [rejectText, setRejectText] = useState("");
  const [rejectConfirming, setRejectConfirming] = useState(false);

  // Fetched once on mount, not per-open: five static strings, and a failure
  // here must be visible in the modal (presetsError) rather than as an empty
  // radio list that reads like "there are no reasons".
  useEffect(() => {
    api
      .get("/admin/producers/rejection-presets")
      .then((r) => setPresets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPresetsError(true));
  }, []);

  const openReject = (producer) => {
    setRejectProducer(producer);
    setPresetKey("");
    setRejectText("");
    setRejectConfirming(false);
  };
  const closeReject = () => setRejectProducer(null);

  const submitReject = () => {
    if (!rejectProducer) return undefined;
    const id = rejectProducer.id;
    const reason = rejectText.trim();
    return run(
      `reject:${id}`,
      async () => {
        // preset_key + reason mirror the backend body exactly; the backend
        // re-validates and 400s, so this is not the only guard.
        await api.post(`/admin/producers/${id}/reject`, {
          preset_key: presetKey,
          reason,
        });
        closeReject();
        loadAllProducers();
        showToast.success(t("producers.reject.toast_rejected"));
      },
      // 400 = the backend rejected the body (unknown preset, or "other" with
      // no free text). Mirrors the request-changes 409 handling above.
      (err) =>
        showToast.error(
          err?.response?.status === 400
            ? t("producers.reject.invalid_input")
            : errorMessage(err, tError),
        ),
    );
  };

  return {
    rejectProducer, presets, presetsError,
    presetKey, setPresetKey,
    rejectText, setRejectText,
    rejectConfirming,
    openReject, closeReject, submitReject,
    requestRejectConfirm: () => setRejectConfirming(true),
    cancelRejectConfirm: () => setRejectConfirming(false),
  };
}
