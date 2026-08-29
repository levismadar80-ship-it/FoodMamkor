"use client";

/**
 * Module:   ProducerDecisionModal
 * Purpose:  ONE admin decision composer for a business awaiting review. The
 *           chosen REASON decides the outcome, not the button the admin
 *           happened to click: a fixable reason sends a completion request
 *           (status stays pending, the owner gets a mail saying what is
 *           missing), a terminal one rejects.
 * Touches:  nothing — this component performs no I/O. Both submits are wired
 *           in use-reject-flow.js.
 * Does NOT: own the reason LABELS. They are fetched from
 *           GET /admin/producers/rejection-presets and passed in as `presets`,
 *           because the backend composes the persisted reason and the owner's
 *           email from the same dict (admin.py:1104-1110). A local copy of the
 *           Hebrew here would be a second owner of one fact (workflow.md
 *           Smell #1) and would silently disagree with the email the moment
 *           either moved. "אחר" is the ONE exception and is not a counter-
 *           example: it is i18n chrome describing the free-text input, which
 *           the backend says in so many words at admin.py:1117-1121.
 * Related:  ./use-reject-flow.js (the controller) · ./use-admin-producers.js
 *           (the three entry points) · ./page.js (renders it) ·
 *           __tests__/ProducerDecisionModal.test.jsx
 * History:  MEH-2209 (creation — replaces RejectModal.jsx +
 *           RequestChangesModal.jsx, which routed every reason to /reject).
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

// The completion group. EVERY other preset key — `not_eligible` and any key
// the backend grows later — falls to the terminal group. Fail-closed on
// purpose: before MEH-2209 every reason rejected, so an unrecognised key
// keeps today's behavior instead of silently promising a business owner a
// second chance the admin did not intend.
const CHANGES_PRESET_KEYS = ["missing_docs", "missing_image", "incomplete_info"];

export const CHANGES = "changes";
export const REJECT = "reject";
export const OTHER = "other";

// A radio's value is `<group>:<presetKey>` — one string of state from which
// both the outcome and the wire body are derived, so the two can never
// disagree. `other` appears in BOTH groups, which is exactly why the group
// cannot be looked up from the key alone.
export const decisionValue = (group, key) => `${group}:${key}`;
export const groupOf = (value) => (value || "").split(":")[0];
export const presetKeyOf = (value) => (value || "").split(":").slice(1).join(":");

/** Split the fetched presets into the two groups, appending the "אחר" chrome
 *  option to each. `other` is dropped from the fetched list first — it is
 *  rendered as chrome in both groups, not as a preset in one. */
function partitionPresets(presets, otherLabel) {
  const real = (presets || []).filter((p) => p.key !== OTHER);
  const toOption = (group) => (p) => ({ value: decisionValue(group, p.key), label: p.label });
  return {
    changes: [
      ...real.filter((p) => CHANGES_PRESET_KEYS.includes(p.key)).map(toOption(CHANGES)),
      { value: decisionValue(CHANGES, OTHER), label: otherLabel },
    ],
    reject: [
      ...real.filter((p) => !CHANGES_PRESET_KEYS.includes(p.key)).map(toOption(REJECT)),
      { value: decisionValue(REJECT, OTHER), label: otherLabel },
    ],
  };
}

/** True when the form is complete enough to send. Mirrors both backends: a
 *  reason must be chosen, and "אחר" additionally requires free text
 *  (admin.py reject_producer / request_producer_changes both 400 otherwise,
 *  so this only disables the button — it is not the only guard). */
const canSubmitDecision = (value, freeText) =>
  Boolean(value) && (presetKeyOf(value) !== OTHER || Boolean((freeText || "").trim()));

// One native <fieldset> + <legend> + native radios sharing one `name`, so
// arrow-key navigation inside the group and Tab between groups come from the
// platform. No custom ARIA roles: MEH-2199 is the matrix of components that
// declared an interactive role and then owed a keyboard layer they never
// shipped, and a broken promise reads worse to a screen reader than no
// promise at all.
function ReasonGroup({ legend, helper, name, options, value, onChange, firstRadioRef }) {
  return (
    <fieldset className="mb-4">
      <legend className="block text-sm font-medium text-text">{legend}</legend>
      <p className="text-fg-muted text-xs mb-2">{helper}</p>
      <div className="space-y-1">
        {options.map((opt, index) => (
          <label key={opt.value} className="flex items-start gap-2 text-sm text-text cursor-pointer">
            <input
              ref={index === 0 ? firstRadioRef : undefined}
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-1"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The confirm step REPLACES the form rather than stacking a second overlay on
// it — one dialog at a time keeps the Escape contract below unambiguous.
// Terminal path only: a rejection is not undoable by the owner, a completion
// request is (she fixes it and stays in the queue).
function ConfirmStep({ onCancelConfirm, onSubmit, submitting }) {
  const t = useTranslations("admin");
  return (
    <>
      <p className="text-text text-sm mb-4" data-testid="decision-confirm-message">
        {t("producers.reject.confirm")}
      </p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancelConfirm}
          disabled={submitting}
          className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50 disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          data-testid="decision-confirm-submit"
          className="px-4 py-2 rounded-[8px] text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? t("common.sending") : t("producers.decision.submit_reject")}
        </button>
      </div>
    </>
  );
}

function DecisionForm({ presets, presetsError, value, setValue, freeText, setFreeText, focusGroup, onClose, onSubmit }) {
  const t = useTranslations("admin");
  const firstChangesRadio = useRef(null);
  const groups = partitionPresets(presets, t("producers.decision.other"));
  const isReject = groupOf(value) === REJECT;
  // Same predicate canSubmitDecision() gates the submit on, so the label and
  // the button can never disagree about whether detail is required.
  const isOther = presetKeyOf(value) === OTHER;

  // The row's "בקשת השלמה" button lands the admin on the completion group
  // without choosing FOR her — focus, never a preselection, so the submit
  // button's disabled-until-chosen contract still holds.
  useEffect(() => {
    if (focusGroup === CHANGES && !presetsError) firstChangesRadio.current?.focus();
  }, [focusGroup, presetsError, presets]);

  // A failed presets fetch keeps the modal unusable rather than falling back
  // to a hardcoded list — the fallback is exactly the second owner this
  // component exists to avoid. Carried over from RejectModal.jsx:118-122.
  if (presetsError) {
    return (
      <>
        <p className="text-red-600 text-sm mb-4" role="alert" data-testid="decision-presets-error">
          {t("producers.reject.presets_error")}
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50">
            {t("common.cancel")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <ReasonGroup
        legend={t("producers.decision.changes_legend")}
        helper={t("producers.decision.changes_helper")}
        name="decision-changes"
        options={groups.changes}
        value={value}
        onChange={setValue}
        firstRadioRef={firstChangesRadio}
      />
      <ReasonGroup
        legend={t("producers.decision.reject_legend")}
        helper={t("producers.decision.reject_helper")}
        name="decision-reject"
        options={groups.reject}
        value={value}
        onChange={setValue}
      />

      {/* MEH-2209 follow-up: the label states whether the field is required,
          instead of leaving the admin to infer it from a disabled button. The
          first pass shipped one unconditional label and a submit that just
          stayed grey — a smaller affordance than the modal this replaced,
          which said "פירוט (חובה)". `aria-required` is derived from the SAME
          condition, so the visual and the accessible name cannot disagree. */}
      <label htmlFor="decision-free-text" className="block text-sm font-medium text-text mb-1">
        {isOther
          ? t("producers.decision.free_text_label_required")
          : t("producers.decision.free_text_label_optional")}
      </label>
      <textarea
        id="decision-free-text"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        rows={4}
        aria-required={isOther}
        className="w-full border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
        placeholder={t("producers.decision.free_text_placeholder")}
      />

      <div className="flex gap-2 justify-end mt-4">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50">
          {t("common.cancel")}
        </button>
        {/* Label AND tone are derived from the chosen group, so the button can
            never advertise an outcome different from the one it performs. */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmitDecision(value, freeText)}
          data-testid="decision-submit"
          className={`px-4 py-2 rounded-[8px] text-white disabled:opacity-50 disabled:cursor-not-allowed ${
            isReject ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-90"
          }`}
        >
          {isReject
            ? t("producers.decision.submit_reject")
            : t("producers.decision.submit_changes")}
        </button>
      </div>
    </>
  );
}

export default function ProducerDecisionModal({
  producer, presets, presetsError,
  value, setValue, freeText, setFreeText, focusGroup,
  confirming, onRequestConfirm, onCancelConfirm,
  onClose, onSubmit, submitting,
}) {
  const t = useTranslations("admin");

  // Escape closes — but never mid-send, mirroring DeleteConfirmDialog's
  // "Escape-unless-deleting" contract (page.js:48). A dismissal during the
  // request would strand the admin with no idea whether the email went out.
  useEffect(() => {
    if (!producer) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || submitting) return;
      if (confirming) onCancelConfirm();
      else onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [producer, submitting, confirming, onCancelConfirm, onClose]);

  if (!producer) return null;

  // The completion path is not terminal, so it sends straight away; only the
  // rejection detours through the confirm step.
  const handlePrimary = () => (groupOf(value) === REJECT ? onRequestConfirm() : onSubmit());

  return (
    <div className="fixed inset-0 bg-black/50 z-[9000] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="producer-decision-title"
        className="bg-background rounded-[16px] p-6 max-w-lg w-full border border-border text-start max-h-[90vh] overflow-y-auto"
        data-testid="decision-modal"
      >
        <h2 id="producer-decision-title" className="font-headline-md text-xl font-bold text-text mb-4">
          {t("producers.decision.modal_title", { name: producer.name })}
        </h2>

        {confirming ? (
          <ConfirmStep onCancelConfirm={onCancelConfirm} onSubmit={onSubmit} submitting={submitting} />
        ) : (
          <DecisionForm
            presets={presets}
            presetsError={presetsError}
            value={value}
            setValue={setValue}
            freeText={freeText}
            setFreeText={setFreeText}
            focusGroup={focusGroup}
            onClose={onClose}
            onSubmit={handlePrimary}
          />
        )}
      </div>
    </div>
  );
}
