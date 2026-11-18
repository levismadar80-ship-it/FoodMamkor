"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/DeliveryCard
 * Purpose:  Location mode + delivery areas editor.
 * Does NOT: edit pickup locations or hours: that is LocationsEditor.jsx.
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
import { makeDeliveryCodeResolver } from "@/lib/delivery-errors";
import { fulfillmentTags, FULFILLMENT_WASH_GREEN, FULFILLMENT_WASH_NEUTRAL, FULFILLMENT_ICON_PX } from "@/lib/fulfillmentTags";
import { resolveStoreHours } from "@/lib/hours";
import Input from "@/components/ui/Input";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// MEH-1577: mirrors backend/app/schemas/schemas.py MAX_DELIVERY_MONEY. Not
// importable across the Python/JS boundary, so kept in sync by hand — the
// ceiling exists to catch a typo before the round-trip 422, not as security.
const MAX_DELIVERY_MONEY = 1_000_000;

// ============================================================
// MEH-1242 PR5: producer-facing location-mode + delivery editor. Mirrors the
// admin ProducerForm "business_type" section (physical-store toggle, delivery
// toggle, nationwide-or-cities via CitiesAutocomplete). The owner now writes
// has_physical_location / offers_delivery / delivery_nationwide (previously
// admin-only). Client blocks the invalid states the backend
// ProducerUpdate._validate_location_mode also 422s (neither type;
// nationwide + cities). REUSES: components/admin/ProducerForm.jsx:491-543.
// MEH-1644: saves STRUCTURED delivery_areas rows (city · delivery_day ·
// min_order) instead of the flat delivery_area_cities list — each city gets
// an optional canonical-day select (lib/delivery-days.js mirrors the backend
// whitelist), and registration-captured min_order survives the save instead
// of being wiped by the flat delete+insert path. The admin form still uses
// the flat list (it has no day input — nothing to align).
// ============================================================

// Exported for isolation tests (EditTabDeliveryCard.test.jsx).
export function DeliveryCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.delivery");
  const tMap = useTranslations("map.producer_card");
  const initial = {
    hasPhysical: profile?.has_physical_location ?? true,
    offersDelivery: profile?.offers_delivery ?? false,
    nationwide: profile?.delivery_nationwide ?? false,
    cities: profile?.delivery_areas?.map((d) => d.city).filter(Boolean) ?? [],
    // MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:").
    excluded: profile?.delivery_excluded_cities ?? [],
    // MEH-1577: structured delivery cost. Held as STRINGS in form state (an
    // <input> value must be), with "" meaning "not stated" → null on save.
    // `?? ""` and not `|| ""`: a stored 0 is a real value ("משלוח חינם") and
    // `||` would blank the field every time the owner reopened the form.
    fee: profile?.delivery_fee ?? "",
    freeAbove: profile?.free_delivery_above ?? "",
    // MEH-1644: optional per-city dispatch day (canonical Hebrew values —
    // lib/delivery-days.js mirrors the backend whitelist). "" = no day
    // ("בתיאום מראש"). Legacy free-text values not in the vocabulary load as
    // "" so the select never offers an unstorable value; the stored row is
    // only rewritten on the next save (expand-only).
    days: Object.fromEntries(
      (profile?.delivery_areas ?? [])
        .filter((d) => d.city)
        .map((d) => [d.city, DELIVERY_DAYS.includes(d.delivery_day) ? d.delivery_day : ""]),
    ),
    // MEH-1772 chunk 3: optional per-city fee override. Same string-in-form-
    // state convention as `fee`/`freeAbove` above ("" = not stated → null on
    // save), and the same `?? ""` rather than `|| ""` — a stored 0 means
    // "משלוח חינם for this city" and `||` would blank it on every reopen,
    // silently converting the free case back to "inherits the business rate".
    fees: Object.fromEntries(
      (profile?.delivery_areas ?? [])
        .filter((d) => d.city)
        .map((d) => [d.city, d.delivery_fee ?? ""]),
    ),
  };
  // MEH-1644: min_order isn't editable here, but the structured save must not
  // wipe values registration captured — carry them through per city.
  const minOrders = Object.fromEntries(
    (profile?.delivery_areas ?? [])
      .filter((d) => d.city && d.min_order != null)
      .map((d) => [d.city, d.min_order]),
  );
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
    form.hasPhysical !== baseline.hasPhysical ||
    form.offersDelivery !== baseline.offersDelivery ||
    form.nationwide !== baseline.nationwide ||
    form.cities.length !== baseline.cities.length ||
    form.cities.some((c, i) => c !== baseline.cities[i]) ||
    form.excluded.length !== baseline.excluded.length ||
    form.excluded.some((c, i) => c !== baseline.excluded[i]) ||
    // MEH-1577: String() both sides — baseline holds numbers after a save,
    // form holds input strings, and 35 !== "35" would keep the card
    // permanently dirty (blocking the unsaved-changes guard from ever clearing).
    String(form.fee) !== String(baseline.fee) ||
    String(form.freeAbove) !== String(baseline.freeAbove) ||
    // MEH-1644: a day change on any currently-chosen city is a real edit.
    form.cities.some((c) => (form.days[c] || "") !== (baseline.days[c] || "")) ||
    // MEH-1772 chunk 3: same for a per-city fee. String() both sides for the
    // MEH-1577 reason above — baseline holds numbers after a save, form holds
    // input strings, and 20 !== "20" would keep the card permanently dirty.
    form.cities.some(
      (c) => String(form.fees[c] ?? "") !== String(baseline.fees[c] ?? ""),
    );
  useEffect(() => {
    reportDirty("delivery", dirty);
    return () => reportDirty("delivery", false);
  }, [dirty, reportDirty]);

  const neitherType = !form.hasPhysical && !form.offersDelivery;
  // MEH-2561: the tag her /map card shows, from the SAME function the card
  // uses. Delivery reads the live form (mirrors producer_queries.py:185 —
  // offers_delivery AND (an area OR nationwide)), so toggling here updates the
  // preview before saving. Pickup and hours live in LocationsEditor, so they
  // read the locations loaded with the page (mirrors producer_queries.py:196).
  const mapTags = fulfillmentTags(
    {
      delivers: form.offersDelivery && (form.nationwide || form.cities.length > 0),
      offersPickup: (profile?.locations ?? []).some(
        (loc) => loc?.kind === "pickup" || loc?.kind === "market_stand",
      ),
      storeWithHours: form.hasPhysical && !!resolveStoreHours(profile),
    },
    tMap,
  );
  const mapArranged = mapTags.length === 1 && mapTags[0].key === "arranged";
  const citiesMissing =
    form.offersDelivery && !form.nationwide && form.cities.length === 0;
  const blocked = neitherType || citiesMissing;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    // Normalise: nationwide/cities only meaningful when delivering; cities
    // cleared when nationwide (matches admin form + the backend XOR guard).
    // MEH-1255: excluded list only meaningful in nationwide-delivery mode.
    const cities = form.offersDelivery && !form.nationwide ? form.cities : [];
    const excluded =
      form.offersDelivery && form.nationwide ? form.excluded : [];
    // MEH-1577: "" → null (owner cleared the field / never filled it), any
    // other value → Number. Written as an explicit ""-check rather than
    // `Number(v) || null`, which would turn a legitimate 0 into null and
    // silently downgrade "delivery is free" to "cost not stated".
    const toNullableInt = (v) => (v === "" || v == null ? null : Number(v));
    const normalized = {
      hasPhysical: form.hasPhysical,
      offersDelivery: form.offersDelivery,
      nationwide: form.offersDelivery ? form.nationwide : false,
      cities,
      excluded,
      // Cost is meaningless for a pickup-only business — cleared alongside
      // nationwide/cities above, same normalisation rule.
      fee: form.offersDelivery ? toNullableInt(form.fee) : null,
      freeAbove: form.offersDelivery ? toNullableInt(form.freeAbove) : null,
      days: form.days,
      fees: form.fees,
    };
    // MEH-1644: structured rows replace the flat delivery_area_cities send —
    // each city carries its optional canonical day ("" → null = בתיאום מראש)
    // and preserves any registration-captured min_order (previously wiped by
    // the flat delete+insert path).
    // MEH-1772 chunk 3: delivery_fee rides the same row. toNullableInt, not
    // `|| null` — 0 is a real override ("משלוח חינם" for that city) and must
    // survive the save as 0, not collapse to "inherit the business rate".
    const rows = normalized.cities.map((c) => ({
      city: c,
      delivery_day: normalized.days[c] || null,
      min_order: minOrders[c] ?? null,
      delivery_fee: toNullableInt(normalized.fees[c] ?? ""),
    }));
    try {
      await api.put("/producers/me", {
        has_physical_location: normalized.hasPhysical,
        offers_delivery: normalized.offersDelivery,
        delivery_nationwide: normalized.nationwide,
        delivery_areas: rows,
        delivery_excluded_cities: normalized.excluded,
        delivery_fee: normalized.fee,
        free_delivery_above: normalized.freeAbove,
      });
      // Patch the parent profile so LocationCard gating + re-seeds stay in sync.
      onSave({
        has_physical_location: normalized.hasPhysical,
        offers_delivery: normalized.offersDelivery,
        delivery_nationwide: normalized.nationwide,
        delivery_areas: rows,
        delivery_excluded_cities: normalized.excluded,
        delivery_fee: normalized.fee,
        free_delivery_above: normalized.freeAbove,
      });
      // MEH-1577: back to "" for the inputs — normalized carries null, and a
      // null <input value> makes React warn about an uncontrolled component.
      const asFields = {
        ...normalized,
        fee: normalized.fee ?? "",
        freeAbove: normalized.freeAbove ?? "",
      };
      setBaseline(asFields);
      setForm(asFields);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // MEH-1943 chunk 3: the delivery_validation.py 422s carry a `code`;
      // unknown codes fall back to the server `message`.
      setErrorMsg(
        detailToMessage(err?.response?.data?.detail, makeDeliveryCodeResolver(t)) ||
          t("save_error"),
      );
    } finally {
      setSaving(false);
    }
  };

  // MEH-1821: makes the per-city override's three-value semantics visible.
  // Mirrors the server contract (DeliveryAreaCreate._validate_area_delivery_fee):
  // "" / null = inherits the business-level default · 0 = free for this city ·
  // positive = the city's own rate. Deliberately NOT a truthiness test — `!raw`
  // would collapse 0 into the inherit branch and silently redescribe a free
  // city as "inherits 35 ₪". Returns null when there is nothing to declare:
  // an unstated city while the business default is itself unstated inherits
  // nothing, so no hint is rendered at all.
  const areaFeeHint = (city) => {
    const raw = form.fees[city];
    const stated = raw !== "" && raw !== null && raw !== undefined;
    if (!stated) {
      const base = form.fee;
      if (base === "" || base === null || base === undefined) return null;
      // A business-level 0 is free delivery, and the row below states its own
      // 0 as "משלוח חינם" — rendering the inherited one as "יורש 0 ₪" would
      // show the same value two different ways in the same list. The 0 case
      // is reachable on purpose: the fee input is min="0" and fee_hint tells
      // the owner to write 0 when delivery is free.
      return Number(base) === 0
        ? t("area_fee_inherits_free")
        : t("area_fee_inherits", { fee: base });
    }
    return Number(raw) === 0 ? t("area_fee_free") : null;
  };

  return (
    <div>
      <p className="text-xs text-fg-muted mb-1">{t("subtitle")}</p>
      {/* MEH-1540: scope helper — this card is delivery destinations only,
          the business address itself lives in LocationCard. */}
      <p className="text-xs text-fg-muted mb-4">{t("scope_helper")}</p>

      {/* MEH-2561: preview of the fulfillment tag on her /map card. The tag is
          inferred, never chosen — this line is the only place she sees it. */}
      <div className="mb-4 rounded-md border border-border px-3 py-2" data-testid="delivery-map-preview">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <span>{t("map_preview_label")}</span>
          {mapTags.map((tag) => (
            <span
              key={tag.key}
              data-testid={`delivery-map-preview-${tag.key}`}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs leading-4 whitespace-nowrap ${
                tag.neutral ? FULFILLMENT_WASH_NEUTRAL : FULFILLMENT_WASH_GREEN
              }`}
            >
              {tag.Icon && <tag.Icon size={FULFILLMENT_ICON_PX} weight="regular" aria-hidden="true" />}
              {tag.label}
            </span>
          ))}
        </div>
        {mapArranged && (
          <p className="mt-1 text-xs text-fg-muted" data-testid="delivery-map-preview-hint">
            {t("map_preview_arranged_hint")}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.hasPhysical}
            onChange={(e) => set({ hasPhysical: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          {t("has_physical_location")}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.offersDelivery}
            onChange={(e) => set({ offersDelivery: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          {t("offers_delivery")}
        </label>
        {neitherType && (
          <p className="text-xs text-danger-600">{t("type_validation")}</p>
        )}
        {form.offersDelivery && (
          <div className="ms-6 space-y-3 border-s-2 border-border ps-4 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.nationwide}
                onChange={(e) =>
                  set({
                    nationwide: e.target.checked,
                    ...(e.target.checked ? { cities: [] } : {}),
                  })
                }
                className="w-4 h-4 accent-primary"
              />
              {t("delivery_nationwide")}
            </label>
            {/* MEH-1577: structured delivery cost. Both optional — leaving them
                empty keeps the public page exactly as it is today. Each field
                carries a "where it appears" line + an example placeholder per
                the dashboard field standard (docs/audits/dashboard-field-
                guidance-audit.md, MEH-1539). min=0 on the fee (0 = free),
                min=1 on the threshold, and max=MAX_DELIVERY_MONEY on both
                mirror the server validators, so the browser catches the same
                values the API would 422 on — the ceiling round-trips instead
                of only surfacing after a submit.
                MEH-1821: this block sits ABOVE the area list, not below it.
                It is the default every `delivery_areas` row inherits, and a
                default stated after its own exceptions reads as a repetition
                of them — which is exactly how it was read in the field. Order
                follows Shopify's profile → zone → rate hierarchy: the general
                rate is set first, zones override it underneath. Moving this
                block is presentational only; `handleSave` below is untouched
                and the PUT /producers/me payload is byte-identical. */}
            <div className="space-y-3 pt-1" data-testid="delivery-default-block">
              {/* MEH-1821: the copy is mode-dependent because the block is
                  not. It renders whenever delivery is on, but the per-area
                  list it points at exists only in the non-nationwide branch
                  below — nationwide clears `cities`, so there is no row to
                  override and "ברירת מחדל" would name exceptions that cannot
                  exist. Nationwide gets its own pair: one country-wide fee,
                  nothing beneath it. */}
              <p className="text-sm font-medium">
                {form.nationwide
                  ? t("default_block_title_nationwide")
                  : t("default_block_title")}
              </p>
              <p className="text-xs text-fg-muted">
                {form.nationwide
                  ? t("default_block_hint_nationwide")
                  : t("default_block_hint")}
              </p>
              <div>
                <label
                  htmlFor="delivery-fee"
                  className="block text-sm text-muted mb-1"
                >
                  {t("fee_label")}
                </label>
                <p className="text-xs text-fg-muted mb-1">{t("fee_hint")}</p>
                <Input inline size="sm"
                  id="delivery-fee"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={MAX_DELIVERY_MONEY}
                  step="1"
                  value={form.fee}
                  onChange={(e) => set({ fee: e.target.value })}
                  placeholder={t("fee_placeholder")}
                  className="w-32"
                />
              </div>
              <div>
                <label
                  htmlFor="free-delivery-above"
                  className="block text-sm text-muted mb-1"
                >
                  {t("free_above_label")}
                </label>
                <p className="text-xs text-fg-muted mb-1">
                  {t("free_above_hint")}
                </p>
                <Input inline size="sm"
                  id="free-delivery-above"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_DELIVERY_MONEY}
                  step="1"
                  value={form.freeAbove}
                  onChange={(e) => set({ freeAbove: e.target.value })}
                  placeholder={t("free_above_placeholder")}
                  className="w-32"
                />
              </div>
            </div>
            {!form.nationwide && (
              <div>
                <span className="block text-sm text-muted mb-1">
                  {t("delivery_cities_label")}
                </span>
                <CitiesAutocomplete
                  value={form.cities}
                  onChange={(cities) => set({ cities })}
                  showRegionChips
                />
                {form.cities.length === 0 && (
                  <p className="text-xs text-danger-600 mt-1">
                    {t("delivery_cities_required")}
                  </p>
                )}
                {/* MEH-1644: optional per-city dispatch day — select-from-
                    canonical (lib/delivery-days.js), never free text. Empty
                    option = "בתיאום מראש" (stored as null). Dashboard field
                    standard: label + where-it-appears hint + select. */}
                {form.cities.length > 0 && (
                  <div className="mt-3">
                    <span className="block text-sm text-muted mb-0.5">
                      {t("delivery_days_label")}
                    </span>
                    <p className="text-xs text-fg-muted mb-2">
                      {t("delivery_days_hint")}
                    </p>
                    {/* MEH-1772 chunk 3: the per-city fee override shares this
                        list — both are per-city dimensions of the same row, so
                        a second list would ask the owner to match cities across
                        two tables. Label + "where it appears" hint + example
                        placeholder per the dashboard field standard
                        (docs/audits/dashboard-field-guidance-audit.md,
                        MEH-1539). min/max mirror the server validators
                        (DeliveryAreaCreate._validate_area_delivery_fee). */}
                    <span className="block text-sm text-muted mb-0.5">
                      {t("area_fee_label")}
                    </span>
                    <p className="text-xs text-fg-muted mb-2">
                      {t("area_fee_hint")}
                    </p>
                    <ul className="space-y-1.5">
                      {form.cities.map((c) => (
                        <li
                          key={c}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{c}</span>
                          <Input inline size="xs"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={MAX_DELIVERY_MONEY}
                            step="1"
                            value={form.fees[c] ?? ""}
                            aria-label={t("area_fee_aria", { city: c })}
                            data-testid={`delivery-fee-input-${c}`}
                            onChange={(e) =>
                              set({ fees: { ...form.fees, [c]: e.target.value } })
                            }
                            placeholder={t("area_fee_placeholder")}
                            className="w-20"
                          />
                          <select
                            value={form.days[c] || ""}
                            aria-label={t("day_select_aria", { city: c })}
                            data-testid={`delivery-day-select-${c}`}
                            onChange={(e) =>
                              set({ days: { ...form.days, [c]: e.target.value } })
                            }
                            className="border border-border rounded-sm px-2 py-1 text-sm bg-surface focus-ring"
                          >
                            <option value="">{t("day_arranged")}</option>
                            {DELIVERY_DAYS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                          {/* MEH-1821: declares what an unstated row inherits.
                              `w-full` makes it wrap onto its own line inside
                              the flex row rather than competing for width with
                              the inputs. */}
                          {areaFeeHint(c) && (
                            <p
                              className="w-full text-xs text-fg-muted"
                              data-testid={`delivery-fee-hint-${c}`}
                            >
                              {areaFeeHint(c)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {/* MEH-1255: nationwide exclusion list — "לכל הארץ חוץ מ:" */}
            {form.nationwide && (
              <div>
                <span className="block text-sm text-muted mb-1">
                  {t("delivery_excluded_label")}
                </span>
                <p className="text-xs text-fg-muted mb-1">
                  {t("delivery_excluded_hint")}
                </p>
                <CitiesAutocomplete
                  value={form.excluded}
                  onChange={(excluded) => set({ excluded })}
                  showRegionChips
                />
              </div>
            )}
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
        variant="primary" size="sm" className="mt-4"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </Button>
    </div>
  );
}
