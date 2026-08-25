"use client";

import { useTranslations } from "next-intl";
import { DELIVERY_DAYS } from "@/lib/delivery-days";

// MEH-1771: id of the ghost-state hint, referenced by every pill's
// aria-describedby so a screen reader announces WHY the row is inert.
const DAY_HINT_ID = "delivery-day-hint";

/**
 * DeliveryDayRow (MEH-1645, discoverability reworked in MEH-1771) — day
 * refinement for the delivery-city filter. ALWAYS rendered: without a city it
 * shows a muted "ghost" row plus a hint, so the filter is discoverable before
 * an area is picked instead of appearing out of nowhere once a city lands. One
 * pill per canonical day (lib/delivery-days.js — the exact values
 * GET /producers?delivery_day= accepts); tapping the active day clears it.
 *
 * MEH-1825 — extracted from app/[locale]/home/ActiveFilterChip.jsx to
 * components/ so the canonical listing surface (/producers, declared canonical
 * by MEH-1774) mounts the SAME component as home rather than a second copy.
 * Before the extract the row existed only on home, so tapping "משלוח" on home
 * deep-linked to precisely the page where the day axis did not exist.
 *
 * MEH-1771 — the row is a permanent anchor, not progressive disclosure:
 * Baymard "Consider Promoting Important Filters (61% Don't)" — a filter with
 * no fixed anchor is found by accident. The city PRECONDITION is unchanged
 * and still correct (a day without a city yields meaningless results); only
 * the VISIBILITY changed. Ghost pills carry aria-disabled (NOT the disabled
 * attribute) so they stay focusable and clickable — a click routes into the
 * surface's city-entry path via onSelectDay, which is the prerequisite the
 * hint names. Pattern: MDN aria-disabled + Smashing "Usability Pitfalls of
 * Disabled Buttons" (hint next to the control beats hiding it).
 *
 * The ghost look is the MUTED TOKEN ALONE — deliberately no `opacity-*`.
 * Measured: text-fg-muted (#5c584f) on the pill's white bg is 7.1:1, but the
 * same token at opacity-60 composites to 2.78:1, under the WCAG AA 4.5:1
 * floor (IS 5568 makes AA mandatory here). WCAG's "inactive component"
 * exemption does NOT cover these: they are focusable, clickable, and reading
 * them IS the discovery path this row exists for. Exactly the MEH-919 finding
 * — globals.css dropped a Leaflet `opacity: 0.6` for the same reason. Dim
 * further only by swapping the token, never by stacking opacity.
 *
 * Placement note (MEH-1645 Phase 0 correction): the MEH-1645 spec names
 * "FilterSheet", but FilterSheet.jsx is mounted only by /map's
 * FilterChipsBar — and /map was out of that ticket's scope. The home has no
 * filter sheet; this row beside the ActiveFilterChip is the home equivalent.
 * MEH-2173 UPDATE: the second half of that sentence is now false in both
 * clauses — FilterSheet is mounted by /map, /producers AND home, and home
 * therefore does have a filter sheet. The DECISION still stands and the day
 * axis stays out of it: the sheet holds boolean ATTRIBUTE axes, while a day
 * requires a city and routes through a modal when it has none. It is left
 * here, corrected rather than deleted, because the reasoning is what a future
 * reader needs and the stale premise is what would mislead them.
 *
 * ONE handler, not two (MEH-1825 deviation from the ticket's file_locations
 * note, which suggested a separate no-city tap prop). Both surfaces already
 * route the ghost tap inside their own onSelectDay — home's
 * useHomePage.handleDaySelected and ProducersClient.handleDaySelected each
 * open their own LocationModal when no city is set. A second prop would have
 * to be threaded through home's call site to do what home already does,
 * which is the change most likely to break the "home byte-identical"
 * criterion for zero behavioural gain.
 *
 * i18n: the home.producers.day_row_* keys are reused verbatim on /producers —
 * the strings are surface-neutral ("יום משלוח:", "בחרו אזור כדי לסנן לפי יום
 * משלוח") and MEH-1825's scope forbids new copy keys.
 *
 * MEH-2036 — the axis is MULTI-SELECT: `daysActive` is an ARRAY and each pill
 * toggles its own day independently (tap adds, tap again removes that day
 * only). `aria-pressed` is per-pill, which is what makes the multi-select
 * legible to a screen reader without any new copy — the previous single-select
 * shape already used aria-pressed, so the semantics widen rather than change.
 * Baymard: mutually-exclusive facet values are a top-15% filtering defect
 * because they force a reload between every comparison.
 *
 * MEH-2173 — the ghost hint moved inline (see the block comment at the hint
 * itself for what that measured). Behaviour is untouched: same key, same copy,
 * same id, same aria-describedby, same city precondition, same modal route.
 *
 * Does NOT: own filter state, fetching, or the modal — the mounting surface
 * does (useHomePage on home, ProducersClient on /producers). It also does not
 * de-duplicate or cap `daysActive`; the mounting surface normalizes on
 * hydration (both surfaces do) and the backend re-validates.
 */
export function DeliveryDayRow({ cityActive, daysActive, onSelectDay }) {
  const t = useTranslations();
  const ghost = !cityActive;
  // MEH-2036: tolerate a null/undefined prop so a surface that has not yet
  // hydrated renders the ghost row rather than throwing on .includes.
  const selected = daysActive || [];

  return (
    <div className="mb-6" data-testid="delivery-day-row" data-ghost={ghost ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">{t("home.producers.day_row_label")}</span>
        {/* MEH-2173: the ghost hint moved INSIDE this flex-wrap row, directly
            after the label, instead of sitting in its own <p> below the pills.
            Copy, key, id and aria-describedby wiring are untouched.

            Everything MEH-1771 established is preserved: the row still always
            renders, the hint still appears only in the ghost state, it is still
            the accessible description of every inert pill, and a pill tap still
            routes into the surface's city-entry path.

            It renders BEFORE the pills on purpose — the hint explains why the
            controls that follow are inert, so a reader meets the reason before
            the thing it explains. `m-0` because the old `mt-2` existed only to
            separate it as a block; inside the row the `gap-2` spaces it.

            WHAT THIS ACTUALLY BUYS, measured rather than assumed
            (qa-meh2173-promoted-filters.mjs, before/after against a real
            browser): at 1440 the day row goes 2 rendered lines -> 1. At 390 it
            stays at 3 — the hint gives up its own line and a pill wraps into
            the space, netting zero. That is not a placement mistake: the
            alternative (hint AFTER the pills) was built and measured too and
            came out identical, 390 6 bands / 1440 4 bands either way, because
            7 pills plus a ~230px hint cannot share 358px of usable width
            however they are ordered. Saving that line on mobile needs shorter
            copy or fewer pills, both of which this card rules out. The literal
            placement the card asked for was kept since the two tie. */}
        {ghost && (
          <p id={DAY_HINT_ID} data-testid="delivery-day-hint" className="m-0 text-sm text-fg-muted">
            {t("home.producers.day_row_hint")}
          </p>
        )}
        {DELIVERY_DAYS.map((day) => {
          const active = !ghost && selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={active}
              aria-disabled={ghost}
              aria-describedby={ghost ? DAY_HINT_ID : undefined}
              aria-label={t("home.producers.day_option_aria", { day })}
              data-testid={`delivery-day-pill-${day}`}
              className={`px-3 py-1 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active
                  ? "bg-primary text-white border-primary"
                  : ghost
                    ? "bg-surface text-fg-muted border-border"
                    : "bg-surface text-text border-border hover:bg-green-50"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
