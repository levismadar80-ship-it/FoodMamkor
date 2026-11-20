// @ts-check
"use client";
/**
 * Module:   AreaTermsRow
 * Purpose:  One row of the business page's delivery list: the towns that share
 *           the same terms (a zone shows its name, then its towns), and those
 *           terms once, on one muted line joined by «·».
 * Does NOT: decide which towns share terms (DeliveryBlock's `keyOf`) or cap
 *           the list (DeliveryBlock `capSections`).
 * History:  MEH-3511 — Sapir 20/11 «חופר מידי… מרוב כל המלל זה מבלבל»: towns
 *           with the same terms were a row each, with the fee and minimum in a
 *           second column that wrapped to two lines at 375.
 */
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import { deliveryTermTexts } from "@/components/DeliveryTerms";

// «·» after every term but the last, drawn by CSS so a missing term leaves no
// stray dot, and a wrapped line ends with the dot instead of starting with it.
// The rounded, divided card a list of area rows sits in (DeliveryBlock and
// NationwideZones share it).
export const LIST_CARD =
  "divide-y divide-border rounded-lg border border-border bg-surface-card overflow-hidden";
export const TERMS_LINE =
  "mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-fg-muted [&>*:not(:last-child)]:after:ms-1.5 [&>*:not(:last-child)]:after:content-['·']";
const SENTINEL = "\u0000";

/** A message whose {amount} is the price, isolated for RTL (MEH-1168). @param {string} text @param {number} amount */
function withAmount(text, amount) {
  const [before, after = ""] = text.split(SENTINEL);
  return (
    <>
      {before}
      <bdi>{formatPrice(amount)}</bdi>
      {after}
    </>
  );
}

/**
 * @param {{ rows: any[], fee?: number | null, next?: import("react").ReactNode }} props
 */
export default function AreaTermsRow({ rows, fee = null, next = null }) {
  const t = useTranslations("group_buys.delivery");
  const tWeekdays = useTranslations("opening_hours.weekdays");
  const da = rows[0];
  const towns = rows.map((r) => r.city).join(", ");
  const zone = da.zone_name && rows.every((r) => r.zone_name === da.zone_name) ? da.zone_name : null;
  const free = typeof da.free_delivery_above === "number" && fee !== 0 ? da.free_delivery_above : null;
  const terms = [
    fee == null ? null : (
      <span key="fee" data-testid="area-fee">
        {fee === 0 ? t("fee_free") : withAmount(t("fee", { amount: SENTINEL }), fee)}
      </span>
    ),
    free == null ? null : (
      <span key="free" data-testid="area-free-above">
        {withAmount(t("free_above", { amount: SENTINEL }), free)}
      </span>
    ),
    da.min_order ? (
      <span key="min">
        {t("min_order")} <span dir="ltr">{formatPrice(da.min_order)}</span>
      </span>
    ) : null,
    ...deliveryTermTexts({ daysMin: da.delivery_days_min, daysMax: da.delivery_days_max, cutoffRow: da, t, tWeekdays }).map(
      (term) => (
        <span key={term.key} data-testid={`area-terms-${term.key}`}>
          {term.text}
        </span>
      ),
    ),
  ].filter(Boolean);
  // A row with nothing but the towns (and the shared business fee) — the
  // plain line of a day.
  const plain = !zone && terms.length <= (fee == null ? 0 : 1);
  return (
    <li className="px-3.5 py-3 text-sm" data-testid={plain ? "area-plain-cities" : "area-row"}>
      {/* Sapir 20/11: a visitor looks for her own town, so the towns are the
          title; the zone's name is a small tag beside them. */}
      <p className="font-medium text-text" data-testid={plain ? "area-plain-cities-names" : "area-row-title"}>
        {towns}
        {zone ? (
          <span
            className="ms-1.5 inline-block rounded-full bg-background-alt px-2 py-0.5 align-middle text-xs font-normal text-fg-muted"
            data-testid="area-zone-tag"
          >
            {zone}
          </span>
        ) : null}
      </p>
      {terms.length > 0 ? (
        <p className={TERMS_LINE} data-testid="area-terms">
          {terms}
        </p>
      ) : null}
      {next}
    </li>
  );
}
