// @ts-check
"use client";

/**
 * MEH-3592: on the owner's group-buy card — change the caps (never below what
 * already joined, the server refuses that) and stop / reopen joins. Eventbrite
 * and Shopify let a seller change capacity and pause sales mid-run; before
 * this, the only way to stop a group taking orders was to cancel it.
 * Collapsed by default: a weekly-at-most tool on a daily screen.
 * MEH-3597 (Sapir 21/11): the pickup time can be changed here too, the same
 * two fields as the create form; saved with the caps.
 * MEH-3610: the pickup branch and the allergens too (GroupBuySafetyFields).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import GroupBuyPickupWindowFields, { pickupWindowPayload } from "@/components/group-buy/GroupBuyPickupWindowFields"; // MEH-3597
import { pickupWindowFields } from "@/lib/group-buy-pickup";
import GroupBuySafetyFields from "@/components/group-buy/GroupBuySafetyFields"; // MEH-3610

/** @param {number | string | null | undefined} v */
const toField = (v) => (v == null ? "" : String(v));
// The server takes a people cap of 2 or more (GroupBuySettingsUpdate, ge=2).
const PEOPLE_MIN = 2;
/** @param {string} v @param {number} floor */
const toCap = (v, floor) => (String(v).trim() === "" ? null : Math.max(floor, Math.floor(Number(v)) || floor));

/** @param {{ gb: any, onSaved: () => Promise<void> | void }} props */
export default function GroupBuyOwnerSettings({ gb, onSaved }) {
  const t = useTranslations("group_buys.dashboard.settings");
  const [open, setOpen] = useState(false);
  const [maxPeople, setMaxPeople] = useState(toField(gb.max_participants));
  const [maxUnits, setMaxUnits] = useState(toField(gb.max_units));
  const saved = pickupWindowFields(gb.pickup_starts_at, gb.pickup_ends_at);
  const [pickupStart, setPickupStart] = useState(saved.start);
  const [pickupEnd, setPickupEnd] = useState(saved.endTime);
  const [windowError, setWindowError] = useState(/** @type {string | null} */ (null));
  // MEH-3610: the branch and the allergens, fixable after joining closed too.
  const savedAllergens = gb.allergens || [];
  const savedLocation = gb.pickup_location?.id || "";
  const [allergens, setAllergens] = useState(/** @type {string[]} */ (savedAllergens));
  const [locationId, setLocationId] = useState(savedLocation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (/** @type {Record<string, unknown>} */ body) => {
    setError("");
    setBusy(true);
    try {
      await api.patch(`/group-buys/${gb.id}/settings`, body);
      showToast.success(t("saved"));
      await onSaved();
    } catch (error_) {
      setError(detailToMessage(error_.response?.data?.detail) || t("failed"));
    } finally {
      setBusy(false);
    }
  };

  // A delivery-only group has no pickup time (the page hides it too).
  const deliveryOnly = Boolean(gb.delivery_note) && !gb.pickup_note && !gb.fulfillment_note;
  const saveAll = () => {
    // Only what changed is sent. Caps can change only while the group runs,
    // the time, the branch and the allergens also after joining closed (the
    // server's rule, MEH-3610), so an untouched cap must not ride along. Nor
    // must an untouched window: the form cannot show a cross-day one exactly,
    // and a rewrite would mail everyone.
    /** @type {Record<string, unknown>} */
    const body = {};
    const people = toCap(maxPeople, PEOPLE_MIN);
    const units = toCap(maxUnits, 1);
    if (people !== (gb.max_participants ?? null)) body.max_participants = people;
    if (units !== (gb.max_units ?? null)) body.max_units = units;
    if (allergens.join() !== savedAllergens.join()) body.allergens = allergens.length ? allergens : null;
    if (locationId !== savedLocation) body.pickup_location_id = locationId || null;
    if (!deliveryOnly && (pickupStart !== saved.start || pickupEnd !== saved.endTime)) {
      const pickupWindow = pickupWindowPayload(pickupStart, pickupEnd);
      if ("error" in pickupWindow) {
        setWindowError(pickupWindow.error);
        return;
      }
      Object.assign(body, pickupWindow);
    }
    setWindowError(null);
    send(body);
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="group-buy-owner-settings">
      {gb.joins_closed && (
        <p className="mb-2 text-sm text-fg-muted" data-testid="group-buy-joins-closed-owner">{t("closed_note")}</p>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-primary hover:underline"
        data-testid="group-buy-settings-toggle"
      >
        {t("toggle")}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("max_people")} type="number" min={PEOPLE_MIN} value={maxPeople} onChange={(e) => setMaxPeople(e.target.value)} placeholder={t("no_cap")} dir="ltr" />
            <Input label={t("max_units")} type="number" min={1} value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} placeholder={t("no_cap")} dir="ltr" />
          </div>
          <p className="text-xs text-fg-muted">{t("caps_hint")}</p>
          {!deliveryOnly && (
            <GroupBuyPickupWindowFields
              start={pickupStart}
              endTime={pickupEnd}
              onStart={(e) => setPickupStart(e.target.value)}
              onEnd={(e) => setPickupEnd(e.target.value)}
              error={windowError}
            />
          )}
          <GroupBuySafetyFields
            idPrefix={`gb-${gb.id}`}
            allergens={allergens}
            onAllergens={setAllergens}
            locationId={locationId}
            onLocation={setLocationId}
            showPlace={!deliveryOnly}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" disabled={busy} onClick={saveAll} data-testid="group-buy-settings-save">
              {t("save")}
            </Button>
            <Button variant="outlined" size="md" disabled={busy} onClick={() => send({ joins_open: Boolean(gb.joins_closed) })} data-testid="group-buy-joins-switch">
              {gb.joins_closed ? t("reopen") : t("stop")}
            </Button>
          </div>
          {error && <InlineMessage>{error}</InlineMessage>}
        </div>
      )}
    </div>
  );
}
