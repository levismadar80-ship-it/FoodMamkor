"use client";

/**
 * Module:   use-reject-flow  (exports useDecisionFlow)
 * Purpose:  Controller for the admin decision composer — fetches the canonical
 *           reason labels, holds the modal's state, and routes the submit to
 *           ONE of two existing endpoints based on the group the chosen reason
 *           belongs to.
 * Touches:  GET /admin/producers/rejection-presets · POST
 *           /admin/producers/{id}/request-changes (non-terminal, MEH-1011) ·
 *           POST /admin/producers/{id}/reject (terminal, MEH-226). Both email
 *           the business owner.
 * Does NOT: own the reason LABELS, and does NOT own the busy registry — `run`
 *           is passed in so a decision shares one in-flight guard with
 *           approve / delete / toggle on the same row.
 * Naming:   the file is still `use-reject-flow.js` and the hook is no longer
 *           reject-only. MEH-2209 scoped this file to UPDATE, not rename;
 *           the export name carries the current meaning.
 * Related:  ./use-admin-producers.js (composes this; owns the three entry
 *           points) · ./ProducerDecisionModal.jsx (the view) · backend
 *           admin.py::PRODUCER_REJECTION_PRESETS (the labels) ·
 *           __tests__/ProducerDecisionModal.test.jsx
 * History:  MEH-226 (creation, reject only). MEH-1011 (request-changes lived
 *           in use-admin-producers.js). MEH-2209 (merged: the reason decides
 *           the endpoint, so one controller owns both).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { OTHER, REJECT, groupOf, presetKeyOf } from "./ProducerDecisionModal";

// MEH-2209. REUSES the MEH-226 controller shape (open/close/submit + a `run`
// busy key) and adds the routing: `value` carries the group, the group picks
// the endpoint, and the wire body of each path is exactly what that path sent
// before this ticket — /reject still gets {preset_key, reason} and lets the
// backend compose (admin.py:1113-1136), /request-changes still gets {feedback}.
//
// The LABELS are fetched, never hardcoded. The backend composes the persisted
// reason and the owner's email from the same dict, so a local copy here would
// be a second owner of one fact and could disagree with the email (Smell #1).
export function useDecisionFlow(loadAllProducers, run) {
  const t = useTranslations("admin");
  const tError = useTranslations("error");

  const [decisionProducer, setDecisionProducer] = useState(null); // null = closed
  const [presets, setPresets] = useState([]);
  const [presetsError, setPresetsError] = useState(false);
  const [value, setValue] = useState(""); // "<group>:<presetKey>"
  const [freeText, setFreeText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [focusGroup, setFocusGroup] = useState("");

  // Fetched once on mount, not per-open: five static strings, and a failure
  // here must be visible in the modal (presetsError) rather than as an empty
  // radio list that reads like "there are no reasons".
  useEffect(() => {
    api
      .get("/admin/producers/rejection-presets")
      .then((r) => setPresets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPresetsError(true));
  }, []);

  // One opener for all three entry points (use-admin-producers.js wires them).
  // `preselect` preselects a radio, `text` prefills the free text, `focus`
  // only moves focus — the approve-422 path uses the first two so one click
  // still sends, the row button uses the third so the admin still chooses.
  const openDecision = (producer, options = {}) => {
    setDecisionProducer(producer);
    setValue(options.preselect || "");
    setFreeText(options.text || "");
    setFocusGroup(options.focus || "");
    setConfirming(false);
  };
  const closeDecision = () => {
    setDecisionProducer(null);
    setConfirming(false);
  };

  const labelFor = (key) => (presets.find((p) => p.key === key) || {}).label || "";

  // The completion mail has no backend composer of its own (request-changes
  // takes free text only), so the prefix is applied here — from the FETCHED
  // label, never a local string. "אחר" yields the text alone, mirroring the
  // rule the reject composer states at admin.py:1117-1121: that label reads
  // "אחר (פירוט חופשי)", which describes the input and is not a reason, so
  // prefixing it would put it in a business owner's inbox.
  const composeFeedback = () => {
    const text = freeText.trim();
    const key = presetKeyOf(value);
    if (key === OTHER) return text;
    const label = labelFor(key);
    return text ? `${label}: ${text}` : label;
  };

  const submitChanges = (id) => {
    const feedback = composeFeedback();
    if (!feedback) {
      showToast.error(t("producers.request_changes.validate"));
      return undefined;
    }
    return run(
      `request-changes:${id}`,
      async () => {
        await api.post(`/admin/producers/${id}/request-changes`, { feedback });
        closeDecision();
        loadAllProducers();
      },
      // 409 = producer no longer pending (mirrors toggleStatus's precedent).
      (err) =>
        showToast.error(
          err?.response?.status === 409
            ? t("producers.request_changes.invalid_state")
            : errorMessage(err, tError),
        ),
    );
  };

  const submitReject = (id) =>
    run(
      `reject:${id}`,
      async () => {
        // preset_key + reason mirror the backend body exactly; the backend
        // re-validates and 400s, so this is not the only guard.
        await api.post(`/admin/producers/${id}/reject`, {
          preset_key: presetKeyOf(value),
          reason: freeText.trim(),
        });
        closeDecision();
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

  // The single submit the modal calls. The group decides the endpoint — which
  // is the whole point of MEH-2209: before it, four fixable reasons and one
  // terminal reason all reached /reject and dead-ended the business owner.
  const submitDecision = () => {
    if (!decisionProducer) return undefined;
    const id = decisionProducer.id;
    return groupOf(value) === REJECT ? submitReject(id) : submitChanges(id);
  };

  return {
    decisionProducer, presets, presetsError,
    value, setValue,
    freeText, setFreeText,
    focusGroup, confirming,
    openDecision, closeDecision, submitDecision,
    requestDecisionConfirm: () => setConfirming(true),
    cancelDecisionConfirm: () => setConfirming(false),
  };
}
