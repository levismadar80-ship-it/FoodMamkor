"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarBlank, CaretDown, CaretUp, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { DELIVERY_DAYS } from "@/lib/delivery-days";

// MEH-2036 (moved here from ActiveFilterChip in MEH-2186): above ONE selected
// day the chip collapses to "<first> +N" rather than growing without bound.
// The threshold is 1, not the 2 the old location-chip used: this chip is now a
// standalone control in a row beside other chips, so two spelled-out day names
// plus a glyph and an ✕ is already the widest thing on a 390px line. It is also
// what the ticket's own DoD pins — two days deep-linked must read "רביעי +1".
const DAYS_CHIP_INLINE_MAX = 1;

/** Canonical week order (sun→sat), so {שישי, שלישי} always reads "שלישי · שישי"
 *  regardless of the order the user tapped them in. Lifted from
 *  ActiveFilterChip in MEH-2186 along with the day value itself; it is NOT in a
 *  shared lib because after that move exactly one component needs it. */
const sortByWeek = (days) =>
  [...days].sort((a, b) => DELIVERY_DAYS.indexOf(a) - DELIVERY_DAYS.indexOf(b));

/**
 * DeliveryDayRow (MEH-1645 · V3 shape since MEH-2186) — day refinement for the
 * delivery-city filter, rendered as ONE value-carrying dropdown chip plus an
 * inline day panel. Pattern: Google Maps' chip-opens-options, eBay DS's
 * dropdown filter chip ("the title summarizes the values"), Material 3.
 *
 * Filename and export name are unchanged on purpose — both surfaces import it
 * by this name and the ticket forbids the rename. It is no longer a "row" of
 * pills; it is a chip whose panel holds them.
 *
 * MEH-1825 — mounted by BOTH listing surfaces from this one file:
 * components/ProducersClient.jsx and app/[locale]/home/HomeProducersGrid.jsx.
 * Before that extract the row existed only on home, so tapping "משלוח" on home
 * deep-linked to precisely the page where the day axis did not exist.
 *
 * ── What MEH-2186 SUPERSEDES, deliberately and with the reasoning kept ──
 *
 * MEH-1771 established "permanent anchor, not progressive disclosure" (Baymard
 * "Consider Promoting Important Filters (61% Don't)" — a filter with no fixed
 * anchor is found by accident). THE ANCHOR IS KEPT: the chip always renders,
 * is always visible and always clickable, on both surfaces, city or no city.
 * Only its FORM shrank — 7 pills + a hint became one chip. Baymard's argument
 * is about a filter being *reachable*, and a labelled chip is as reachable as
 * a strip; the part that did not survive is the claim that the VALUES have to
 * be on screen too, which does not hold for a closed 7-member vocabulary like
 * weekdays.
 *
 * MEH-1771 also marked the ghost pills with the disabled ARIA flag (never the
 * `disabled` attribute) so they stayed focusable and clickable while LOOKING
 * inert. That combination is now gone entirely, and it is the defect this
 * ticket exists to close: the appearance said "disabled", the behaviour said
 * "tap me", and a user who reads the appearance never finds out. There is
 * nothing left to mark — one chip, always genuinely active.
 *
 * That flag must therefore not appear in this file AT ALL, and this ticket
 * greps for it as a count. The prose above deliberately spells it out in
 * words rather than as the literal attribute, so that the guard measures the
 * markup and not its own explanation. `HomeDeliveryDayFilter.test.jsx` makes
 * the same assertion against the rendered DOM, which is the half a grep over
 * source cannot cover.
 *
 * MEH-2173 moved the ghost hint inline, next to the label, and MEASURED what
 * that bought: at 1440 the row went 2 rendered lines → 1; at 390 it stayed at
 * 3, because "7 pills plus a ~230px hint cannot share 358px of usable width
 * however they are ordered", and it concluded that saving that line "needs
 * shorter copy or fewer pills". This ticket is that conclusion applied: the
 * closed state is now ONE chip, and the hint became microcopy inside the panel
 * where it is read at the moment it is relevant instead of competing for the
 * first-paint line.
 *
 * ── The city precondition (UNCHANGED since MEH-1645) ──
 *
 * A day without a city yields meaningless results, so the axis still requires
 * one. What the chip does about a missing city is what the ghost pills did:
 * the tap routes into the surface's own city-entry path.
 *
 * ONE handler, not two (MEH-1825, re-verified in MEH-2186's Phase 0). Both
 * surfaces already branch on the missing city INSIDE their own onSelectDay —
 * ProducersClient.handleDaySelected and useHomePage.handleDaySelected each
 * open their own LocationModal — and neither branch reads the `day` argument
 * before returning. So the chip calls `onSelectDay()` with NO argument in the
 * no-city state and both surfaces do the right thing. A second "no-city tap"
 * prop would have to be threaded through home's call site to do what home
 * already does, for zero behavioural gain.
 *
 * That call is only safe because the component and the handler read the SAME
 * city: home passes `cityActive` (use-home-page.js `filters.delivery_city ||
 * null`, which is exactly what its guard tests) and /producers passes
 * `cityFilter` (likewise). They cannot disagree about whether a city exists.
 *
 * ── Colour discipline (MEH-1771, still binding) ──
 *
 * Dim states use the MUTED TOKEN ALONE — deliberately no `opacity-*`. Measured:
 * text-fg-muted (#5c584f) on the chip's white bg is 7.1:1, but the same token
 * at opacity-60 composites to 2.78:1, under the WCAG AA 4.5:1 floor (IS 5568
 * makes AA mandatory here). WCAG's "inactive component" exemption does not
 * apply to anything in this file: every control here is focusable, clickable
 * and load-bearing. Exactly the MEH-919 finding — globals.css dropped a Leaflet
 * `opacity: 0.6` for the same reason. Dim further only by swapping the token,
 * never by stacking opacity.
 *
 * ── Placement (MEH-1645 Phase 0 correction, kept) ──
 *
 * MEH-2173 established that FilterSheet is mounted by /map, /producers AND
 * home. The day axis still stays OUT of it: the sheet holds boolean ATTRIBUTE
 * axes, while a day requires a city and routes through a modal when it has
 * none. Kept and corrected rather than deleted, because the reasoning is what
 * a future reader needs and the stale premise is what would mislead them.
 *
 * MEH-2036 — the axis is MULTI-SELECT: `daysActive` is an ARRAY and each pill
 * toggles its own day independently (tap adds, tap again removes that day
 * only). `aria-pressed` is per-pill, which is what makes the multi-select
 * legible to a screen reader. The panel deliberately STAYS OPEN across taps —
 * closing it per selection is the mutually-exclusive-facet defect Baymard puts
 * in the top 15% of filtering failures, because it forces a reload between
 * every comparison.
 *
 * The chip's visible label is lossy above one day ("רביעי +1"), so whenever it
 * collapses, the FULL set rides the chip's aria-label instead. A screen-reader
 * user must never get the truncated form — that split is the whole reason the
 * count lives in the label and not only in the pills.
 *
 * Does NOT: own filter state, fetching, or the modal — the mounting surface
 * does (useHomePage on home, ProducersClient on /producers). It also does not
 * de-duplicate or cap `daysActive`; the mounting surface normalizes on
 * hydration (both surfaces do) and the backend re-validates. It owns exactly
 * one piece of state, and that state is presentational: whether the panel is
 * open.
 */
export function DeliveryDayRow({ cityActive, daysActive, onSelectDay, onClearDays }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const chipRef = useRef(null);
  const rootRef = useRef(null);
  // useId, not a module constant: two mounts of this component on one page
  // would otherwise share an id, and aria-controls would point at whichever
  // panel rendered last. Nothing mounts it twice today; the id is free.
  const panelId = `delivery-day-panel-${useId()}`;

  const hasCity = Boolean(cityActive);
  // MEH-2036: tolerate a null/undefined prop so a surface that has not yet
  // hydrated renders the idle chip rather than throwing on .length.
  // The `hasCity &&` guard preserves the MEH-1771 rule that a day is never
  // shown as active without a city, even if one leaks in through the prop.
  const selected = hasCity ? sortByWeek(daysActive || []) : [];
  const hasDays = selected.length > 0;

  // If the city changes under an open panel — cleared by the city ✕ or
  // "נקו הכל", or switched to another city — the panel's microcopy names a
  // city that is no longer the one being filtered, and on a clear its pills
  // cannot filter at all. Close it rather than leave a stale panel up.
  //
  // Adjusted DURING RENDER, not in an effect. This is React's documented
  // "adjusting some state when a prop changes" pattern, and it is the right
  // one here for two independent reasons: a `useEffect` that calls setState
  // paints the stale panel for one frame first (and the repo's lint flags the
  // cascading render), and tracking the TRANSITION rather than the city's
  // identity is what stops a re-picked city from springing the panel back
  // open on its own. Comparing `cityActive` to a remembered "the panel is
  // open for THIS city" would do exactly that.
  const [prevCity, setPrevCity] = useState(cityActive);
  if (cityActive !== prevCity) {
    setPrevCity(cityActive);
    setOpen(false);
  }

  // Esc closes and returns focus to the chip; an outside click closes without
  // moving focus. Both are bound only WHILE OPEN, so the closed chip costs no
  // document listeners. No focus trap on purpose — this is a disclosure, not a
  // dialog, and trapping focus in it would be the heavier a11y contract.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      chipRef.current?.focus();
    };
    const onMouseDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  const daysFull = selected.join(" · ");
  const chipLabel = !hasDays
    ? t("home.producers.day_chip_idle")
    : selected.length > DAYS_CHIP_INLINE_MAX
      ? t("home.producers.days_chip_more", {
          day: selected[0],
          count: selected.length - 1,
        })
      : daysFull;

  // Only override the accessible name when the VISIBLE one has dropped day
  // names. Below the threshold the visible text is already complete, and an
  // aria-label there would shadow it for no gain.
  const chipAriaLabel =
    hasDays && selected.length > DAYS_CHIP_INLINE_MAX ? daysFull : undefined;

  const handleChipClick = () => {
    if (!hasCity) {
      // No argument: both surfaces' no-city branch opens their LocationModal
      // and returns before reading it. See the header block.
      onSelectDay();
      return;
    }
    setOpen((wasOpen) => !wasOpen);
  };

  const handleClearClick = (e) => {
    // The ✕ sits INSIDE the chip's visual pill but is its own <button> (a
    // button cannot nest a button). stopPropagation is belt-and-braces for a
    // future refactor that wraps them; the panel must not toggle on a clear.
    e.stopPropagation();
    onClearDays?.();
  };

  return (
    <div
      ref={rootRef}
      className="mb-6"
      data-testid="delivery-day-row"
      data-ghost={hasCity ? "false" : "true"}
      data-open={open ? "true" : "false"}
    >
      {/* The chip and its ✕ are siblings inside one pill-shaped wrapper: nested
          <button>s are invalid HTML, and the ✕ needs its own accessible name
          and its own activation. The wrapper carries the colour so the two
          halves read as a single control. */}
      <div
        className={`inline-flex items-center rounded-full border text-sm transition-colors ${
          hasDays
            ? "bg-primary text-white border-primary"
            : "bg-surface text-text border-border hover:bg-green-50"
        }`}
      >
        {/* aria-controls is dropped while closed, because the panel it names is
            not in the DOM then and a reference to an absent id resolves nowhere
            (NVDA+Firefox notably). aria-expanded alone carries the disclosure
            contract, so nothing is lost.

            The other available fix — always render the panel with hidden={!open}
            — was rejected, and not on taste: `toHaveCount` counts DOM matches
            regardless of visibility, so a permanently-mounted panel would make
            the closed-state assertions in flows/27 and the component suite
            ("0 pills when closed") count 7 and pass only if they were weakened.
            That trades a dangling attribute for a weaker test. */}
        <button
          ref={chipRef}
          type="button"
          onClick={handleChipClick}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={chipAriaLabel}
          data-testid="delivery-day-chip"
          className={`inline-flex items-center gap-1.5 py-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            hasDays ? "ps-3 pe-1" : "ps-3 pe-3"
          }`}
        >
          <CalendarBlank size={14} weight="bold" aria-hidden="true" />
          <span>{chipLabel}</span>
          {open ? (
            <CaretUp size={12} weight="bold" aria-hidden="true" />
          ) : (
            <CaretDown size={12} weight="bold" aria-hidden="true" />
          )}
        </button>
        {hasDays && (
          <button
            type="button"
            onClick={handleClearClick}
            aria-label={t("home.producers.day_chip_clear_aria")}
            data-testid="delivery-day-clear"
            className="inline-flex items-center ps-1 pe-2 py-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X size={12} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={t("home.producers.day_chip_idle")}
          data-testid="delivery-day-panel"
          // `w-fit max-w-full`, not a full-width block: the panel is anchored
          // to the chip, so at 1440 a block-level div stretches ~1200px of
          // empty card to the inline-end of seven small pills and reads as a
          // layout bug. Hugging the content keeps it a dropdown at every width,
          // and `max-w-full` is what stops it overflowing at 375 where the
          // pills wrap instead.
          className="mt-2 w-fit max-w-full rounded-2xl border border-border bg-surface p-3"
        >
          {/* MEH-2186: what MEH-2173's inline hint became. It names the city
              because the panel is the one place where "which city am I
              filtering delivery to" is the live question, and it states the
              multi-select affordance, which nothing on screen said before. */}
          <p
            data-testid="delivery-day-panel-hint"
            className="m-0 mb-2 text-sm text-fg-muted"
          >
            {t("home.producers.day_panel_hint", { city: cityActive })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {DELIVERY_DAYS.map((day) => {
              const active = selected.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  aria-pressed={active}
                  aria-label={t("home.producers.day_option_aria", { day })}
                  data-testid={`delivery-day-pill-${day}`}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-surface text-text border-border hover:bg-green-50"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
