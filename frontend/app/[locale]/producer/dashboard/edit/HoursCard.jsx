// @ts-check
"use client";

/**
 * Module:   HoursCard
 * Purpose:  The one «שעות» card on the owner's edit page: opening hours for
 *           each location, the weekly order window, and dated exceptions
 *           (holidays), as three sections of one card.
 * Touches:  PUT /producers/me/locations/{id} with `{ opening_hours }` only —
 *           a partial update (exclude_unset), so nothing else on the location
 *           changes. The order window and special hours save through their own
 *           editors, unchanged.
 * Does NOT: add, move or delete a location (LocationsEditor.jsx), or own the
 *           day-row picker (LocationHoursField.jsx) or the two schedule
 *           editors (OrderWindowEditor.jsx, SpecialHoursEditor.jsx). Delivery
 *           days stay in each delivery zone (DeliveryCard).
 * Related:  edit/page.js (mounts it in the location group, after delivery);
 *           lib/dashboard-edit-anchors.js (`#hours` opens it; `#order-window`
 *           and `#special-hours` open it and scroll to their section, which
 *           carries that id).
 * History:  MEH-3790 — Sapir 24/11 chose one hours card. This reverses two
 *           earlier calls on purpose: MEH-2142 put store hours in each
 *           location's form, and MEH-2264 gave holiday dates a card of their
 *           own (MEH-1830).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, Warning } from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { resolveStoreHours } from "@/lib/hours";
import { upcomingSpecialCount } from "@/lib/special-hours";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import EditAccordionCard from "@/components/EditAccordionCard";
import WhatsThis from "@/components/WhatsThis";
import LocationHoursField from "./LocationHoursField";
import OrderWindowEditor from "./OrderWindowEditor";
import SpecialHoursEditor from "./SpecialHoursEditor";

const LOCATIONS_PATH = "/producers/me/locations";

/**
 * One location's opening hours, saved on their own.
 * @param {{ loc: any, showName: boolean, onDirty: (id: any, dirty: boolean) => void, onSaved: () => void }} props
 */
function LocationHoursRow({ loc, showName, onDirty, onSaved }) {
  const t = useTranslations("dashboard.producer.location");
  const tSave = useTranslations("dashboard.producer.order_window");
  const tKind = useTranslations("settings.locations.kind");
  const stored = loc.opening_hours || "";
  const [value, setValue] = useState(stored);
  const [valid, setValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  // Trimmed on both sides: the save sends the trimmed value, so stray
  // whitespace must not leave the row dirty after a good save.
  const dirty = value.trim() !== stored.trim();
  const nameId = `hours-location-name-${loc.id}`;

  // A re-read of the list (after this row's save, or another edit) brings the
  // stored value; take it, unless the owner is mid-edit. Adjusted during
  // render (React's "storing information from previous renders"), not in an
  // effect, so the eslint set-state-in-effect ratchet stays flat.
  const [seenStored, setSeenStored] = useState(stored);
  if (stored !== seenStored) {
    setSeenStored(stored);
    if (!dirty) setValue(stored);
  }

  useEffect(() => {
    onDirty(loc.id, dirty);
    return () => onDirty(loc.id, false);
  }, [loc.id, dirty, onDirty]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`${LOCATIONS_PATH}/${loc.id}`, { opening_hours: value.trim() || null });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-2"
      data-testid={`hours-location-${loc.id}`}
      role={showName ? "group" : undefined}
      aria-labelledby={showName ? nameId : undefined}
    >
      {showName && (
        <p id={nameId} className="text-sm font-medium text-text">
          {loc.label || loc.city || tKind(loc.kind)}
        </p>
      )}
      <LocationHoursField
        value={value}
        onChange={(next) => {
          setSaved(false);
          setValue(next);
        }}
        onValidityChange={/** @type {any} */ (setValid)}
        isPrimary={!!loc.is_primary}
        kind={loc.kind}
      />
      {error && (
        <InlineMessage size="xs" className="flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {error}
        </InlineMessage>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty || !valid} variant="primary" size="sm">
          {saving ? tSave("saving") : tSave("save_cta")}
        </Button>
        {/* Always mounted, so a screen reader announces the text when it appears. */}
        <span role="status" className="flex items-center gap-1 text-xs text-primary">
          {saved && !dirty && !error && (
            <>
              <CheckCircle size={16} weight="fill" aria-hidden="true" />
              {t("saved")}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/** @param {{ title: string, testId: string, id?: string, children: any }} props */
function HoursSection({ title, testId, id, children }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0" data-testid={testId}>
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

/**
 * @param {{
 *   profile: any,
 *   locations: any[],
 *   open: boolean,
 *   onToggle: () => void,
 *   onSave: (patch: object) => void,
 *   reportDirty: (key: string, dirty: boolean) => void,
 *   onHoursSaved: () => void,
 *   onGoToLocations: () => void,
 * }} props
 */
export default function HoursCard({
  profile,
  locations,
  open,
  onToggle,
  onSave,
  reportDirty,
  onHoursSaved,
  onGoToLocations,
}) {
  const t = useTranslations("dashboard.producer");
  const tTitle = useTranslations("producer.detail.hours");
  const tFields = useTranslations("dashboard.producer.completeness.fields");
  const tLoc = useTranslations("settings.locations");
  const tWhat = useTranslations("whats_this");

  // The rows report one by one; the page's unsaved banner wants one key.
  const [dirtyRows, setDirtyRows] = useState(/** @type {Record<string, boolean>} */ ({}));
  const onRowDirty = useCallback((id, dirty) => {
    setDirtyRows((m) => (Boolean(m[id]) === dirty ? m : { ...m, [id]: dirty }));
  }, []);
  const anyRowDirty = Object.values(dirtyRows).some(Boolean);
  useEffect(() => {
    reportDirty("hours", anyRowDirty);
    return () => reportDirty("hours", false);
  }, [anyRowDirty, reportDirty]);

  const windowDays = Object.keys(profile.order_window || {}).length;
  // eslint-disable-next-line no-restricted-syntax -- MEH-3861: drawn only after the browser fetched the profile, so the server never renders it
  const specialCount = upcomingSpecialCount(profile.special_hours);
  const summary = [
    resolveStoreHours({ ...profile, locations }) ? tFields("hours") : null,
    windowDays > 0 ? t("order_window.summary_set", { count: windowDays }) : null,
    specialCount > 0 ? t("special_hours.summary_set", { count: specialCount }) : null,
  ]
    .filter(Boolean)
    .join(" · ") || t("order_window.summary_empty");

  return (
    <EditAccordionCard anchorId="hours" title={tTitle("heading")} summary={summary} marker={undefined} preview={undefined} open={open} onToggle={onToggle}>
      <div className="space-y-4">
        <HoursSection title={tFields("hours")} testId="hours-section-opening">
          {locations.length === 0 ? (
            <div className="space-y-2" data-testid="hours-no-locations">
              <p className="text-sm text-fg-muted">{tLoc("empty_title")}</p>
              <button
                type="button"
                onClick={onGoToLocations}
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                {tLoc("empty_cta")}
              </button>
            </div>
          ) : (
            locations.map((loc) => (
              <LocationHoursRow
                key={loc.id}
                loc={loc}
                showName={locations.length > 1}
                onDirty={onRowDirty}
                onSaved={onHoursSaved}
              />
            ))
          )}
        </HoursSection>

        <HoursSection id="order-window" title={t("order_window.heading")} testId="hours-section-order-window">
          {/* MEH-1773: names the weekly schedule apart from the dashboard's
              temporary pause switch. */}
          <WhatsThis content={tWhat("order_window")} className="mb-1" testId="whats-this-order-window" />
          <OrderWindowEditor profile={profile} onSave={onSave} reportDirty={/** @type {any} */ (reportDirty)} />
        </HoursSection>

        <HoursSection id="special-hours" title={t("special_hours.heading")} testId="hours-section-special">
          <WhatsThis content={t("special_hours.subtitle")} className="mb-1" testId="whats-this-special-hours" />
          <SpecialHoursEditor profile={profile} onSave={onSave} reportDirty={/** @type {any} */ (reportDirty)} />
        </HoursSection>
      </div>
    </EditAccordionCard>
  );
}
