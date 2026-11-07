"use client";

/**
 * Module:   OrderWindowStrip
 * Purpose:  The headed, contained Info block that lists WHEN this business
 *           accepts orders — days and hours, read from `order_window`.
 * Does NOT: render any status colour or any open/closed verdict — the page's
 *           single status lives in ProducerHeader.jsx and only there
 *           (MEH-1334 / MEH-1546). It also never says anything about what the
 *           business will DO with a message: that claim is unobservable to us
 *           and is forbidden by BRAND.md §7 / ADR-031 (see MEH-1652 below).
 * Related:  frontend/lib/orderWindow.js (getOrderWindowStatus +
 *           getOrderWindowRanges — read-only here),
 *           components/ProducerHeader.jsx (the status branch this complements),
 *           components/OpeningHours.jsx (the card container this block matches).
 * History:  MEH-1546 — chunk 3/3 of the order-window feature.
 *           MEH-1691 — the default-export weekly strip was deleted. It restated
 *           the order window a second time, as an unheaded, uncontained line
 *           floating between the reviews block and "אודות". The window is now
 *           said exactly once as a STATUS, in ProducerHeader's derived meta-line
 *           (MEH-1305 A: "the day is said exactly once"). The filename is kept
 *           because ContactCard imports OrderWindowCtaNote from this path.
 *           That note ended "DO NOT re-add a weekly-schedule render here —
 *           relocating the schedule to a proper Info block is a separate,
 *           unmade decision."
 *           MEH-1875 — that decision is now made, and this is where it landed:
 *           OrderWindowScheduleBlock, a headed, contained Info block. It does
 *           NOT re-create what MEH-1691 removed — the deleted strip was an
 *           unheaded floating line that ALSO restated the current status. This
 *           one is schedule-only (no verdict, no status colour), so the page
 *           still says the status exactly once, in ProducerHeader.
 *           MEH-1652 — OrderWindowCtaNote was DELETED, along with its
 *           `producer.detail.order_window.cta_note` key in both bundles. It was
 *           the last renderer of "היא תמתין לבית העסק עד שההזמנות ייפתחו", the
 *           exact string BRAND.md §7 ("דיבור בשם בית העסק") forbids: its
 *           subject is the business and its verb is in the future, and the
 *           outbound channel is a `wa.me` deep link we never observe (ADR-031),
 *           so the claim was unfalsifiable by construction. Three rewordings
 *           had already failed on this one line (MEH-1546 → MEH-1600 →
 *           MEH-1649) because the defect was structural, not lexical. §7's
 *           sanctioned resolution for "nothing honest to say" is SILENCE —
 *           "הכפתור עומד בפני עצמו" — so the note is gone rather than reworded
 *           a fourth time. The schedule this block renders is the honest half
 *           of what that line was reaching for, and it survives untouched.
 *           MEH-1917 — the merged summary gained a second layer: the FULL week,
 *           one row per open day, behind a quiet disclosure, with today marked.
 *           The merged span ("ראשון–חמישי") is a compression that makes the
 *           reader work out where Wednesday falls; this offers the uncompressed
 *           list without spending the vertical space by default.
 *           DO NOT add a live open/closed status line here — MEH-1917 asked for
 *           one and it was NOT built, deliberately. The header already renders
 *           that exact sentence (lib/order-status.js:84-97 →
 *           `header.status.orders_closed` = "ההזמנות סגורות עכשיו · נפתחות …"),
 *           so a second one is the duplicate MEH-1691 deleted, not a new
 *           feature. The "Does NOT" clause above and its guard test in
 *           __tests__/OrderWindowScheduleBlock.test.jsx still hold; reversing
 *           them is Sapir's call, not a side effect of another ticket.
 *           MEH-2264 (MEH-1889 chunk B) — a third layer, "שעות מיוחדות": the
 *           owner's UPCOMING per-date overrides, listed under the weekly
 *           schedule with the date, the hours (or "not accepting orders"),
 *           and the display-only `note`. Past dates never render (ruling ג).
 *           Still schedule-only — the date list carries no verdict about NOW;
 *           the header's status already reads today's override. Clock-derived
 *           (which dates are still ahead), so it arrives after mount like the
 *           today-chip, and an override-only producer's block appears then.
 *           MEH-2803 — the page said its hours twice: this block under «מתי
 *           מקבלים הזמנות», then an unlabelled store-hours card under «הגעה
 *           ומיקום», nearly the same values in two formats. Now ONE «שעות»
 *           section (ProducerHoursSection below, Google Business Profile «More
 *           hours» pattern): the schedule block is the «מקבלים הזמנות» SET, the
 *           store hours the «פתוח למבקרים» set, and when both parse and match
 *           day by day there is ONE set, «הזמנות וביקור במקום». The subtitle row
 *           («הימים והשעות שבהם בית העסק מקבל הזמנות») restated the heading
 *           above it and is gone. Rendering inside each set is unchanged.
 */

import { Fragment, useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import OpeningHours from "@/components/OpeningHours";
import { parseHours, resolveStoreHours, sameWeeklyHours } from "@/lib/hours";
import { humanTime } from "@/lib/time-format";

import {
  ORDER_DAY_KEYS,
  getOrderWindowRanges,
  getUpcomingSpecialDates,
  israelNowParts,
  normalizeDayEntries,
} from "@/lib/orderWindow";

const NOON_UTC = 12;

/**
 * "21 בספטמבר" for an ISO date, in the page locale. Built from a UTC-noon
 * instant and formatted in Asia/Jerusalem, so neither the runner's zone nor the
 * IST/IDT offset can move the calendar day (`new Date("YYYY-MM-DD")` is UTC
 * midnight, which is still "yesterday" for the first hours of an Israel day).
 */
function formatSpecialDate(isoDate, locale) {
  const [y, m, d] = isoDate.split("-").map(Number);
  // DISPLAY formatter for a stored ISO date — israelToday()/israelNowParts()
  // still own "now"; this only prints a calendar day in the page locale.
  // guard-ok: display formatting of a stored date, not a clock read
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem", // guard-ok: display formatting of a stored date, not a clock read
  }).format(new Date(Date.UTC(y, m - 1, d, NOON_UTC)));
}

// MEH-1875: index-aligned with lib/orderWindow.js ORDER_DAY_KEYS, so index 0 is
// Sunday on every axis. REUSES: components/DeliveryBlock.jsx:13 (same
// dayIndex → label-key mapping); the labels themselves are a separate, compact
// set ("ראשון") because "יום ראשון–יום חמישי" reads badly as a merged range.
const DAY_LABEL_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * "09:00–14:00, 16:00–19:00" — an en-dash inside a range, a comma between
 * ranges. REUSES: components/OpeningHours.jsx:36 (identical grammar, so the two
 * cards in the same visual family read the same way).
 *
 * Rendered as one `whitespace-nowrap` span PER RANGE rather than as a single
 * joined string, so a line break can only fall BETWEEN ranges — never inside
 * one. Measured at 375px with a merged label and three ranges: the joined-string
 * form broke at the en-dash and rendered "20:00–" above "22:00", which reads as
 * two separate times rather than one range.
 *
 * The comma rides INSIDE the span (it must never start a line) but the space
 * after it is emitted OUTSIDE, as the only break opportunity in the row. That
 * split is load-bearing, not styling: with the space inside the nowrap span the
 * whole list becomes one unbreakable token, and on `/en` at 375px — where
 * "Sunday–Thursday" is 109px against Hebrew's 76px — the row then overflowed its
 * card and `overflow-hidden` CLIPPED the third range out of sight. Measured
 * both ways; silently losing a range is worse than the break this exists to fix.
 */
function RangeList({ ranges }) {
  return ranges.map((r, i) => (
    <Fragment key={`${r.open}-${r.close}`}>
      <span className="whitespace-nowrap">
        {humanTime(r.open)}–{humanTime(r.close)}
        {i < ranges.length - 1 ? "," : ""}
      </span>
      {i < ranges.length - 1 ? " " : ""}
    </Fragment>
  ));
}


/**
 * Every OPEN day on its own row — the un-merged truth behind the summary.
 *
 * `getOrderWindowRanges` MERGES consecutive identical days ("ראשון–חמישי"),
 * which is the compression this layer exists to undo: a merged range makes the
 * reader locate a day inside a span instead of reading it off. So this iterates
 * ORDER_DAY_KEYS directly and never touches the merged output.
 */
function openDaysOf(orderWindow) {
  const out = [];
  for (let i = 0; i < ORDER_DAY_KEYS.length; i += 1) {
    const ranges = normalizeDayEntries(orderWindow?.[ORDER_DAY_KEYS[i]]);
    if (ranges.length > 0) out.push({ dayIndex: i, ranges });
  }
  return out;
}

/**
 * MEH-1875 — the weekly order schedule, as a headed Info block.
 *
 * WHAT IT IS NOT: a status. There is no open/closed verdict and no status
 * colour here; the page's single status stays in ProducerHeader (MEH-1305 A /
 * MEH-1334). This block answers "which days and hours does this business take
 * orders?", which the header's one-line status cannot say and which had no
 * home at all between MEH-1691 and this ticket.
 *
 * SSR-safe with NO mounted guard, unlike OrderWindowCtaNote above: it renders
 * getOrderWindowRanges, which is clock-free (lib/orderWindow.js:218 — it reads
 * only the stored map, never `new Date()`). Verified in Phase 0. That is what
 * makes the block safe to render on the server pass, and it is the reason the
 * schedule and the status are two different components rather than one.
 *
 * `null` / `{}` / an all-malformed window → getOrderWindowRanges returns [] and
 * this returns null, so the block is absent from the DOM entirely — no empty
 * container, no heading, zero layout shift.
 */
export function OrderWindowScheduleBlock({ orderWindow, specialHours = null, label = null }) {
  const t = useTranslations("producer.detail.order_window");
  const tDays = useTranslations("producer.detail.order_window.days");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  // MEH-2264: "which overrides are still ahead" is clock-derived — same
  // after-mount rule as todayIndex below. The server pass renders no special
  // list, and an override-only producer's block is therefore client-only.
  const [upcoming, setUpcoming] = useState([]);
  useEffect(() => setUpcoming(getUpcomingSpecialDates(specialHours)), [specialHours]);
  // MEH-1917: "which day is today" is clock-derived, so it must not run on the
  // server pass — the same reason ProducerHeader.jsx:118-120 gates its status.
  // Deliberately NOT a guard around the whole block: the schedule itself stays
  // SSR-rendered (it is clock-free) and only the highlight arrives after mount,
  // so the server string is unchanged and there is nothing to mismatch.
  const [todayIndex, setTodayIndex] = useState(-1);
  useEffect(() => setTodayIndex(israelNowParts().dayIndex), []);

  const rows = getOrderWindowRanges(orderWindow);
  const openDays = openDaysOf(orderWindow);
  // The disclosure is offered ONLY when the summary is actually hiding
  // something — i.e. some days merged. With no merging the summary IS the
  // per-day list, and a control labelled "כל השבוע" that reveals a verbatim
  // copy of the rows above it is noise wearing the costume of an affordance.
  const hasMergedRows = openDays.length > rows.length;
  if (rows.length === 0 && upcoming.length === 0) return null;

  return (
    // MEH-2803: one labelled SET inside ProducerHoursSection's «שעות» section —
    // the section owns the heading; this owns its label and its card.
    <div data-testid="hours-set" data-set="orders">
      {label && <h3 className={SET_LABEL_CLASS}>{label}</h3>}
      {/* Container copied from components/OpeningHours.jsx:52 so the order
          schedule and the store hours read as one family of Info cards. */}
      <div
        className="border border-border rounded-md bg-surface overflow-hidden"
        data-testid="order-window-schedule"
      >
        {/* MEH-1917: the summary is REPLACED by the full week, not stacked above
            it. Caught by eye, not by a pin: the first build rendered both, so a
            Sun–Thu producer showed "ראשון–שלישי" and then ראשון, שני, שלישי
            again directly underneath — the same schedule twice in one card.
            Two layers means one at a time. */}
        {!expanded && (
        <div className="px-3.5 py-2">
          {rows.map((row) => (
            <div
              key={row.fromDay}
              className="flex justify-between gap-4 text-sm py-1.5 text-fg-muted"
              data-testid="order-window-schedule-row"
            >
              {/* shrink-0: the day label is the shorter side, so without it flex
                  steals width from it first and a merged "ראשון–חמישי" is the
                  thing that breaks. The times side is the one allowed to wrap. */}
              <span className="shrink-0">
                {row.fromDay === row.toDay
                  ? tDays(DAY_LABEL_KEYS[row.fromDay])
                  : `${tDays(DAY_LABEL_KEYS[row.fromDay])}–${tDays(DAY_LABEL_KEYS[row.toDay])}`}
              </span>
              {/* dir="ltr" so the numerals keep their reading order on the RTL
                  page — same treatment OpeningHours gives every time range.
                  text-end keeps the wrapped second line aligned with the first
                  instead of drifting to the middle of the row. */}
              <span dir="ltr" className="text-end">
                <RangeList ranges={row.ranges} />
              </span>
            </div>
          ))}
        </div>
        )}

        {/* MEH-1917 layer 2 — the full week, per day, behind a quiet disclosure.
            Yext/Mussi: a day-by-day list beats a compressed span, because a span
            makes the reader work out where Wednesday falls. The summary above
            stays as the fast answer; this is the precise one. */}
        {hasMergedRows && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls="order-window-week"
              data-testid="order-window-week-toggle"
              // min-h-touch: measured at 41px with py-2.5 alone
              // (qa-meh1917-order-window.mjs P6), which is under the tap target.
              // The floor is explicit rather than tuned via padding so a future
              // font-size change cannot quietly drop it back under.
              className="flex min-h-touch w-full items-center justify-center gap-1 border-t border-border px-3.5 py-2.5 text-sm text-fg-muted transition hover:text-text focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {expanded ? t("hide_week") : t("show_week")}
              <CaretDown
                size={12}
                aria-hidden="true"
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>

            {expanded && (
              <div
                id="order-window-week"
                className="border-t border-border px-3.5 py-2"
                data-testid="order-window-week"
              >
                {openDays.map((day) => {
                  const isToday = day.dayIndex === todayIndex;
                  return (
                    <div
                      key={day.dayIndex}
                      className={`flex justify-between gap-4 py-1.5 text-sm ${
                        isToday ? "font-medium text-text" : "text-fg-muted"
                      }`}
                      data-testid="order-window-week-row"
                      data-day={day.dayIndex}
                      data-today={isToday ? "true" : undefined}
                    >
                      <span className="flex shrink-0 items-center gap-1.5">
                        {tDays(DAY_LABEL_KEYS[day.dayIndex])}
                        {isToday && (
                          <span
                            data-testid="order-window-today-chip"
                            className="rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs text-primary-dark"
                          >
                            {t("today")}
                          </span>
                        )}
                      </span>
                      {/* Split ranges stack rather than running on one line: a
                          day with a break is two separate windows, and comma-
                          joining them reads as one long one. */}
                      <span dir="ltr" className="flex flex-col items-end text-end">
                        {day.ranges.map((r) => (
                          <span key={`${r.open}-${r.close}`} className="whitespace-nowrap">
                            {humanTime(r.open)}–{humanTime(r.close)}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* MEH-2264 layer 3 — upcoming special dates. Rendered as a plain list
            under the weekly schedule: date + note on the start side, hours (or
            "not accepting orders") on the end side, same row grammar as above.
            No verdict, no status colour — ProducerHeader already reads today's
            override into the page's single status (MEH-1305 A). */}
        {upcoming.length > 0 && (
          <div
            className="border-t border-border px-3.5 py-2"
            data-testid="order-window-special"
          >
            <div className="py-1 text-sm font-medium text-text">{t("special_heading")}</div>
            {upcoming.map((d) => (
              <div
                key={d.date}
                className="flex justify-between gap-4 py-1.5 text-sm text-fg-muted"
                data-testid="order-window-special-row"
                data-date={d.date}
                data-closed={d.closed ? "true" : undefined}
              >
                <span className="flex shrink-0 flex-col">
                  <span>{formatSpecialDate(d.date, locale)}</span>
                  {d.note && <span className="text-xs">{d.note}</span>}
                </span>
                {d.closed ? (
                  <span className="text-end">{t("special_closed")}</span>
                ) : (
                  // dir="ltr" keeps the numerals in reading order on the RTL
                  // page; text-end then aligns them to the row's END edge —
                  // the same pair the weekly rows above use. rtl-ok
                  <span dir="ltr" className="text-end">
                    <RangeList ranges={d.ranges} />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SET_LABEL_CLASS = "text-base font-semibold text-text mb-2";

/** order_window → the parsed-hours map shape (dayIndex → ranges), or null. */
function orderWindowAsHoursMap(orderWindow) {
  const days = openDaysOf(orderWindow);
  return days.length ? Object.fromEntries(days.map((d) => [d.dayIndex, d.ranges])) : null;
}

/**
 * MEH-2803 — the business page's ONE hours section, «שעות».
 *
 * Two facts can live here, each under its own label: when the business takes
 * orders (`order_window`, + upcoming special dates) and when the place is open
 * to visitors (store hours, `resolveStoreHours`). When both parse AND match day
 * by day they are one fact, said once, under «הזמנות וביקור במקום» with the
 * order-window card. Either side unreadable → both sets, labelled — an
 * unreadable string is never merged (sameWeeklyHours returns false on null).
 *
 * Gate: order rows or upcoming specials, OR store hours. Neither → null, no
 * heading. Upcoming specials are clock-derived and arrive after mount (same
 * rule as OrderWindowScheduleBlock), so an override-only business's section
 * appears then.
 *
 * Does NOT: show a status (ProducerHeader owns it, MEH-1305 A), touch pickup
 * points' own hours (DeliveryBlock / MiniMap, MEH-1509), or add a section-nav
 * pill (no new nav entry, section-nav.js).
 * Guard: __tests__/ProducerHoursSection.test.jsx («one fact, one place»).
 */
export function ProducerHoursSection({ producer }) {
  const t = useTranslations("producer.detail.hours");
  const orderWindow = producer?.order_window;
  const specialHours = producer?.special_hours ?? null;
  const [upcoming, setUpcoming] = useState([]);
  useEffect(() => setUpcoming(getUpcomingSpecialDates(specialHours)), [specialHours]);

  const storeHours = resolveStoreHours(producer);
  const hasOrders = getOrderWindowRanges(orderWindow).length > 0 || upcoming.length > 0;
  if (!hasOrders && !storeHours) return null;
  const merged = hasOrders && sameWeeklyHours(orderWindowAsHoursMap(orderWindow), parseHours(storeHours));

  return (
    <section className="mt-12" data-testid="producer-hours">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-3">{t("heading")}</h2>
      <div className="space-y-5">
        {hasOrders && (
          <OrderWindowScheduleBlock
            orderWindow={orderWindow}
            specialHours={specialHours}
            label={merged ? t("label_both") : t("label_orders")}
          />
        )}
        {storeHours && !merged && (
          <div data-testid="hours-set" data-set="visit">
            <h3 className={SET_LABEL_CLASS}>{t("label_visit")}</h3>
            <OpeningHours opening_hours={storeHours} />
          </div>
        )}
      </div>
    </section>
  );
}
