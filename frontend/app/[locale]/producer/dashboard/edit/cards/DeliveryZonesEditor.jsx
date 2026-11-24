// @ts-check
"use client";
/**
 * Module:   DeliveryZonesEditor
 * Purpose:  «אזורי משלוח» — group several delivery cities into a named zone
 *           with its own days (several), minimum, fee and free-delivery
 *           threshold, instead of setting each city one by one (MEH-3484).
 * Does NOT: save anything. It hands the zone list to DeliveryCard, whose
 *           «שמירה» sends it as `delivery_zones`; the server copies each
 *           zone's values onto its cities (backend/app/services/delivery_zones.py).
 *           Cities are picked from the card's own city list, never typed.
 * Related:  DeliveryCard.jsx (owner + admin), DeliveryBulkDay.jsx (the
 *           one-day shortcut for cities outside a zone).
 * History:  MEH-3484 (creation); MEH-3511 (delivery time + own order cutoff
 *           per zone; a nationwide business gets zones too — «אזורים בתנאים
 *           אחרים», cities picked freely since there is no city list).
 */
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import OrderCutoffPicker from "../OrderCutoffPicker";
import DeliveryTimeFields from "./DeliveryTimeFields";
import Checkbox from "@/components/ui/Checkbox";

// Mirrors backend MAX_DELIVERY_MONEY / MAX_DELIVERY_ZONES (app/limits.py).
const MAX_DELIVERY_MONEY = 1_000_000;
const MAX_DELIVERY_ZONES = 20;
const ZONE_NAME_MAX = 40;

/**
 * @typedef {{ key: string, name: string, cities: string[], days: string[],
 *   min: string|number, fee: string|number, free: string|number,
 *   dmin: string|number, dmax: string|number, cutDay: string, cutTime: string }} ZoneForm
 */

/** @param {any[] | null | undefined} zones @returns {ZoneForm[]} */
export function zonesFromProfile(zones) {
  return (zones || []).map((z, i) => ({
    key: `z${i}`,
    name: z.name || "",
    cities: z.cities || [],
    days: z.delivery_days || [],
    min: z.min_order ?? "",
    fee: z.delivery_fee ?? "",
    free: z.free_delivery_above ?? "",
    // MEH-3511
    dmin: z.delivery_days_min ?? "",
    dmax: z.delivery_days_max ?? "",
    cutDay: z.order_cutoff_day || "",
    cutTime: z.order_cutoff_time || "",
  }));
}

/** @param {string|number} v */
const toNullableInt = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/**
 * The body shape for PUT `delivery_zones`, cities limited to the card's list.
 * `cities` null = nationwide: there is no list, a zone's cities are its own.
 * @param {ZoneForm[]} zones @param {string[] | null} cities
 */
export function zonesForSave(zones, cities) {
  return zones.map((z) => ({
    name: z.name.trim(),
    cities: cities ? z.cities.filter((c) => cities.includes(c)) : z.cities,
    delivery_days: DELIVERY_DAYS.filter((d) => z.days.includes(d)),
    min_order: toNullableInt(z.min),
    delivery_fee: toNullableInt(z.fee),
    free_delivery_above: toNullableInt(z.free),
    delivery_days_min: toNullableInt(z.dmin),
    delivery_days_max: toNullableInt(z.dmax),
    order_cutoff_day: z.cutDay || null,
    order_cutoff_time: z.cutTime || null,
  }));
}

/** @param {ZoneForm[]} zones @returns {Record<string, string>} city → zone name */
export function zoneOfCity(zones) {
  return Object.fromEntries(zones.flatMap((z) => z.cities.map((c) => [c, z.name.trim()])));
}

/** @param {ZoneForm[]} zones @param {number} i @param {string[]} picked */
function withCities(zones, i, picked) {
  // A city sits in one zone: putting it here takes it out of any other.
  return zones.map((z, j) =>
    j === i ? { ...z, cities: picked } : { ...z, cities: z.cities.filter((c) => !picked.includes(c)) },
  );
}

/**
 * @param {{ zones: ZoneForm[], cities: string[], nationwide?: boolean,
 *   onChange: (zones: ZoneForm[]) => void }} props
 */
export default function DeliveryZonesEditor({ zones, cities, nationwide = false, onChange }) {
  const t = useTranslations("dashboard.producer.delivery");

  /** @param {number} i @param {Partial<ZoneForm>} patch */
  const update = (i, patch) => onChange(zones.map((z, j) => (j === i ? { ...z, ...patch } : z)));

  const add = () =>
    onChange([
      ...zones,
      { key: `n${Date.now()}`, name: "", cities: [], days: [], min: "", fee: "", free: "", dmin: "", dmax: "", cutDay: "", cutTime: "" },
    ]);

  /** @param {number} i @param {string} city */
  const toggleCity = (i, city) => {
    const now = zones[i].cities;
    onChange(withCities(zones, i, now.includes(city) ? now.filter((c) => c !== city) : [...now, city]));
  };

  /** @param {number} i @param {string} day */
  const toggleDay = (i, day) => {
    const days = zones[i].days;
    update(i, { days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  };

  return (
    <section className="mt-4 rounded-sm border border-border p-3" data-testid="delivery-zones">
      <h4 className="text-sm font-medium">{t(nationwide ? "zones_label_nationwide" : "zones_label")}</h4>
      <p className="text-xs text-fg-muted mb-2">{t(nationwide ? "zones_hint_nationwide" : "zones_hint")}</p>
      {zones.length === 0 && (
        <p className="text-xs text-fg-muted mb-2" data-testid="delivery-zones-empty">
          {t("zone_empty")}
        </p>
      )}
      <ul className="space-y-3">
        {zones.map((z, i) => (
          <li key={z.key} className="rounded-sm bg-surface-card p-3 space-y-3" data-testid={`delivery-zone-${i}`}>
            <ZoneHeader t={t} zone={z} index={i} onName={(name) => update(i, { name })} onRemove={() => onChange(zones.filter((_, j) => j !== i))} />
            {nationwide ? (
              <div data-testid={`delivery-zone-${i}-cities-free`}>
                <span className="block text-xs text-muted mb-1">{t("zone_cities_label")}</span>
                <CitiesAutocomplete value={z.cities} onChange={(picked) => onChange(withCities(zones, i, picked))} showRegionChips />
              </div>
            ) : (
              <CheckGroup
                legend={t("zone_cities_label")}
                items={cities}
                checked={z.cities}
                onToggle={(c) => toggleCity(i, c)}
                testid={`delivery-zone-${i}-city`}
              />
            )}
            <div>
              <CheckGroup
                legend={t("zone_days_label")}
                items={DELIVERY_DAYS}
                checked={z.days}
                onToggle={(d) => toggleDay(i, d)}
                testid={`delivery-zone-${i}-day`}
              />
              <p className="text-xs text-fg-muted mt-1">{t("zone_days_hint")}</p>
            </div>
            <ZoneMoney t={t} zone={z} index={i} onChange={(patch) => update(i, patch)} />
            <DeliveryTimeFields
              min={z.dmin}
              max={z.dmax}
              testid={`delivery-zone-${i}-time`}
              onChange={(patch) => update(i, patch)}
            />
            <OrderCutoffPicker
              day={z.cutDay}
              time={z.cutTime}
              hint={t("zone_cutoff_hint")}
              testid={`delivery-zone-${i}-cutoff`}
              onChange={(p) => update(i, {
                ...(p.order_cutoff_day !== undefined ? { cutDay: p.order_cutoff_day } : {}),
                ...(p.order_cutoff_time !== undefined ? { cutTime: p.order_cutoff_time } : {}),
              })}
            />
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="outlined"
        className="mt-3"
        onClick={add}
        disabled={zones.length >= MAX_DELIVERY_ZONES}
        data-testid="delivery-zone-add"
      >
        {t("zone_add")}
      </Button>
    </section>
  );
}

/**
 * @param {{ t: any, zone: ZoneForm, index: number, onName: (v: string) => void, onRemove: () => void }} props
 */
function ZoneHeader({ t, zone, index, onName, onRemove }) {
  return (
    <div className="flex items-end gap-2">
      <label className="flex-1 text-xs text-muted">
        {t("zone_name_label")}
        <Input
          inline
          size="sm"
          value={zone.name}
          maxLength={ZONE_NAME_MAX}
          placeholder={t("zone_name_placeholder")}
          onChange={(e) => onName(e.target.value)}
          data-testid={`delivery-zone-${index}-name`}
          className="w-full"
        />
      </label>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRemove}
        aria-label={t("zone_remove")}
        data-testid={`delivery-zone-${index}-remove`}
        className="min-h-11 min-w-11"
      >
        <Trash size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * @param {{ legend: string, items: string[], checked: string[], onToggle: (v: string) => void, testid: string }} props
 */
function CheckGroup({ legend, items, checked, onToggle, testid }) {
  return (
    <fieldset>
      <legend className="text-xs text-muted mb-1">{legend}</legend>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <li key={item}>
            <Checkbox
              className="inline-flex items-center gap-1.5 text-sm min-h-11"
              checked={checked.includes(item)}
              onChange={() => onToggle(item)}
              data-testid={`${testid}-${item}`}
            >
              {item}
            </Checkbox>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * @param {{ t: any, zone: ZoneForm, index: number, onChange: (patch: Partial<ZoneForm>) => void }} props
 */
function ZoneMoney({ t, zone, index, onChange }) {
  /** @type {Array<[keyof ZoneForm, string, string]>} */
  const fields = [
    ["min", t("area_min_label"), "1"],
    ["fee", t("area_fee_label"), "0"],
    ["free", t("zone_free_above_label"), "1"],
  ];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-3">
        {fields.map(([field, label, min]) => (
          <label key={field} className="flex flex-col gap-0.5 text-xs text-muted">
            {label}
            <Input
              inline
              size="xs"
              type="number"
              inputMode="numeric"
              min={min}
              max={MAX_DELIVERY_MONEY}
              step="1"
              value={zone[field]}
              onChange={(e) => onChange({ [field]: e.target.value })}
              data-testid={`delivery-zone-${index}-${field}`}
              className="w-24"
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{t("zone_free_above_hint")}</p>
    </div>
  );
}
