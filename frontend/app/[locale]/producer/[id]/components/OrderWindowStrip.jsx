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
 */

import { Fragment } from "react";
import { CalendarCheck } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { getOrderWindowRanges } from "@/lib/orderWindow";

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
        {r.open}–{r.close}
        {i < ranges.length - 1 ? "," : ""}
      </span>
      {i < ranges.length - 1 ? " " : ""}
    </Fragment>
  ));
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
export function OrderWindowScheduleBlock({ orderWindow }) {
  const t = useTranslations("producer.detail.order_window");
  const tDays = useTranslations("producer.detail.order_window.days");
  const rows = getOrderWindowRanges(orderWindow);
  if (rows.length === 0) return null;

  return (
    <section className="mt-8 border-t border-border pt-8" data-testid="order-window-schedule">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-3">
        {t("schedule_heading")}
      </h2>
      {/* Container copied from components/OpeningHours.jsx:52 so the order
          schedule and the store hours read as one family of Info cards. */}
      <div className="border border-border rounded-md bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border text-sm text-text">
          <CalendarCheck size={16} className="text-primary-dark shrink-0" aria-hidden="true" />
          <span>{t("schedule_subtitle")}</span>
        </div>
        <div className="px-3.5 py-2">
          {rows.map((row) => (
            <div
              key={row.fromDay}
              className="flex justify-between gap-4 text-[13px] py-1.5 text-fg-muted"
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
      </div>
    </section>
  );
}
