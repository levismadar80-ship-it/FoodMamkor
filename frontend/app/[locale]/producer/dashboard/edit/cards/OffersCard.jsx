"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/OffersCard
 * Purpose:  Owner-facing offer (deal) editor.
 * Does NOT: render the public offer badge: that is components/OfferBadge.
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// ============================================================
// MEH-1823 chunk 3 — OffersCard: the owner's single typed offer.
// Four types, an optional threshold, an optional free-text line, and a
// MANDATORY end date. Sends `active_offer` on the same PUT /producers/me as
// every other card here (producer_me._sync_active_offer replaces the active
// row rather than updating it, so the unique partial index holds).
//
// Three write states, and they are NOT the same request:
//   type == ""      -> {active_offer: null}   deactivate
//   type set        -> {active_offer: {...}}  replace
//   card untouched  -> the key is never sent  leave alone
// The third is why every other card can be saved without wiping the offer.
// ============================================================

// Which types show the threshold pair. All four typed ones — the threshold is
// optional for EVERY type and deliberately not gated by type (Sapir, 02/08:
// "10% off pickup over ₪100" and "first order over ₪150" are real offers).
// Kept as a named constant rather than inlined `true` so the decision is
// visible at the point a future reader would try to narrow it.
//
// MEH-1898 added `custom` as the fifth, and it IS the one exception to the
// paragraph above — but only here, in the form. The backend stayed uniform
// (no type-conditional validation, five CHECKs unchanged); what changes is
// what the owner is shown. `custom` has no platform sentence for a threshold
// to sit inside, so there is nothing to attach «מעל 100 ₪» to, and a field
// whose value can never be rendered is a field that should not be on screen.
const OFFER_TYPES = [
  "free_delivery_above",
  "gift_above",
  "first_order",
  "pickup_discount",
  "custom",
];
const CUSTOM_OFFER_TYPE = "custom";
const THRESHOLD_UNITS = ["ils", "units", "liters", "kg"];
const MAX_OFFER_HEADLINE = 60;

// Exported for isolation tests (OfferBadge.test.jsx renders it directly).
export function OffersCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("producer.offer");
  const existing = profile?.active_offer ?? null;
  const initial = {
    // "" = no active offer. Held as strings for the same reason DeliveryCard
    // does it: an <input>/<select> value must be one.
    type: existing?.offer_type ?? "",
    threshold: existing?.threshold_value ?? "",
    unit: existing?.threshold_unit ?? "",
    headline: existing?.headline ?? "",
    expires: existing?.expires_at ?? "",
  };
  const [baseline, setBaseline] = useState(initial);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const dirty =
    form.type !== baseline.type ||
    String(form.threshold) !== String(baseline.threshold) ||
    form.unit !== baseline.unit ||
    form.headline !== baseline.headline ||
    form.expires !== baseline.expires;

  // The cleanup is not optional: every other card here returns
  // reportDirty(key, false), and without it the card stays "dirty" after
  // unmount, so the editor's unsaved-changes warning fires forever on a
  // card the owner already left.
  useEffect(() => {
    reportDirty("offer", dirty);
    return () => reportDirty("offer", false);
  }, [dirty, reportDirty]);

  // Client-side mirrors of the two server rules most likely to be hit, so the
  // owner sees them before a round-trip. The server remains the authority —
  // these only shorten the loop, they do not replace the 422.
  const hasType = form.type !== "";
  const isCustom = form.type === CUSTOM_OFFER_TYPE;
  const thresholdStated = String(form.threshold).trim() !== "";
  const unitStated = form.unit !== "";
  // Suppressed for `custom`, where the threshold inputs are not rendered. An
  // owner who half-filled the pair under another type and then switched would
  // otherwise be blocked by an error naming two fields she can no longer see.
  const pairBroken = hasType && !isCustom && thresholdStated !== unitStated;
  const missingExpiry = hasType && !form.expires;
  // MEH-1898 — the ONLY required-headline rule in the system, and it lives
  // here on purpose. The API accepts a headline-less `custom` offer (uniform
  // validation, see ProducerOfferCreate) and OfferBadge renders nothing for
  // one. Neither is a good outcome for the owner: she would save successfully
  // and then find no offer on her page, with nothing telling her why. This
  // check is what turns that silent no-op into a visible "write your words"
  // before the request is made.
  //
  // `.trim()` matches OfferBadge's own test on the render side — the two must
  // agree about what counts as words, or the form permits exactly the state
  // the badge refuses to draw.
  const missingCustomHeadline = isCustom && form.headline.trim() === "";
  const blocked = pairBroken || missingExpiry || missingCustomHeadline;

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = hasType
        ? {
            offer_type: form.type,
            // toNullableInt semantics: "" -> null, never 0. A 0 here would be
            // rejected by the server anyway (threshold must be > 0), but
            // sending null is the honest encoding of "not stated".
            //
            // `!isCustom &&` — a hidden field's value must not be submitted.
            // Switching an existing offer to `custom` leaves the old threshold
            // in form state while its inputs are unmounted, and sending it
            // would persist a number the owner can no longer see, edit, or
            // find rendered anywhere. Clearing it is what the screen says is
            // happening. The pair goes to null TOGETHER, so the both-or-neither
            // CHECK holds either way.
            threshold_value:
              !isCustom && thresholdStated ? Number(form.threshold) : null,
            threshold_unit: !isCustom && thresholdStated ? form.unit : null,
            headline: form.headline.trim() || null,
            expires_at: form.expires,
          }
        : null;
      await api.put("/producers/me", { active_offer: payload });
      // No `id` in the optimistic patch. The save REPLACES the row, so the old
      // id is wrong and the new one is server-assigned and unknown here —
      // an earlier version wrote `id: existing?.id ?? null`, which asserted a
      // null id for a business creating its first offer. Omitting the key says
      // "unknown", which is true; `null` says "there isn't one", which isn't.
      // Nothing reads it today; the real id arrives with the next profile load.
      onSave({ active_offer: payload });
      setBaseline(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-fg-muted mb-1">{t("card_subtitle")}</p>
      <p className="text-xs text-fg-muted mb-4">{t("scope_helper")}</p>

      <div className="space-y-3">
        <div>
          <label htmlFor="offer-type" className="block text-sm text-muted mb-1">
            {t("type_label")}
          </label>
          <select
            id="offer-type"
            value={form.type}
            data-testid="offer-type-select"
            onChange={(e) => set({ type: e.target.value })}
            className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-surface focus-ring"
          >
            <option value="">{t("type_none")}</option>
            {OFFER_TYPES.map((ot) => (
              <option key={ot} value={ot}>{t(`types.${ot}`)}</option>
            ))}
          </select>
        </div>

        {/* Everything below is meaningless without a type, so the whole block
            is gated — the "no offer" state is a genuinely empty card, not a
            form full of disabled inputs. */}
        {hasType && (
          <div className="ms-6 space-y-3 border-s-2 border-border ps-4 pt-1">
            {/* MEH-1898: hidden for `custom`. Unmounted, not disabled — a
                disabled input still reads as "a thing this offer has, greyed
                out", and a threshold is not a thing a custom offer has. */}
            {!isCustom && (
            <div>
              <span className="block text-sm text-muted mb-0.5">{t("threshold_label")}</span>
              <p className="text-xs text-fg-muted mb-2">{t("threshold_hint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input inline size="sm"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.threshold}
                  aria-label={t("threshold_label")}
                  data-testid="offer-threshold-input"
                  onChange={(e) => set({ threshold: e.target.value })}
                  placeholder={t("threshold_placeholder")}
                  className="w-24"
                />
                <select
                  value={form.unit}
                  aria-label={t("unit_label")}
                  data-testid="offer-unit-select"
                  onChange={(e) => set({ unit: e.target.value })}
                  className="border border-border rounded-sm px-3 py-2 text-sm bg-surface focus-ring"
                >
                  <option value="">{t("unit_label")}</option>
                  {THRESHOLD_UNITS.map((u) => (
                    <option key={u} value={u}>{t(`units.${u}`)}</option>
                  ))}
                </select>
              </div>
              {pairBroken && (
                <p className="text-xs text-danger-600 mt-1" data-testid="offer-pair-error">
                  {t("threshold_pair_required")}
                </p>
              )}
            </div>
            )}

            <div>
              {/* MEH-1898: under `custom` this field stops being the optional
                  extra line and becomes the offer itself, so the label must
                  stop saying «(לא חובה)». Reuses the dropdown's own approved
                  string rather than inventing a second name for one thing. */}
              <label htmlFor="offer-headline" className="block text-sm text-muted mb-1">
                {isCustom ? t("types.custom") : t("headline_label")}
              </label>
              <p className="text-xs text-fg-muted mb-1">
                {isCustom ? t("custom_hint") : t("headline_hint")}
              </p>
              <Input inline size="sm"
                id="offer-headline"
                type="text"
                maxLength={MAX_OFFER_HEADLINE}
                value={form.headline}
                required={isCustom}
                aria-required={isCustom}
                aria-invalid={missingCustomHeadline}
                data-testid="offer-headline-input"
                onChange={(e) => set({ headline: e.target.value })}
                placeholder={t("headline_placeholder")}
                className="w-full"
              />
              {missingCustomHeadline && (
                <p className="text-xs text-danger-600 mt-1" data-testid="offer-headline-error">
                  {t("custom_headline_required")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="offer-expires" className="block text-sm text-muted mb-1">
                {t("expires_label")}
              </label>
              <p className="text-xs text-fg-muted mb-1">{t("expires_hint")}</p>
              <Input inline size="sm"
                id="offer-expires"
                type="date"
                value={form.expires}
                data-testid="offer-expires-input"
                onChange={(e) => set({ expires: e.target.value })}
              />
              {missingExpiry && (
                <p className="text-xs text-danger-600 mt-1" data-testid="offer-expiry-error">
                  {t("expires_required")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <InlineMessage size="xs" className="mt-3 flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </InlineMessage>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !dirty || blocked}
        data-testid="offer-save"
        variant="primary" size="sm" className="mt-4"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </Button>
    </div>
  );
}
