"use client";

/**
 * Module:   HomeWhatsOn
 * Purpose:  MEH-2859 — one home strip for everything date-bound at the
 *           businesses: events, experiences, group buys and surprise baskets.
 *           Soonest first, one row per type before any type repeats, so a busy
 *           events calendar cannot take all three rows.
 * Touches:  GET /events/upcoming, GET /experiences, GET /group-buys and
 *           GET /rescue/offers — all four public and unauthenticated, all four
 *           asked ONLY once the strip nears the viewport, so the home page's
 *           first paint spends no request on a section below the fold
 *           (MEH-2233).
 * Does NOT: gate the nav (lib/use-hub-nav-gate.js and the two per-hub hooks own
 *           that), own the /events hub tab row, or render a countdown — a group
 *           buy states its closing date and never "closes in N days".
 * Related:  components/HomepageMiniMapLazy.jsx (the near-viewport pattern this
 *           mirrors, MEH-2850 C), app/[locale]/home/HomeClient.jsx (the only
 *           consumer), app/[locale]/home/HomeCategoryGrid.jsx:61-67 (the
 *           eyebrow + gold-rule pattern this repeats).
 * History:  MEH-2859 (creation — replaces app/[locale]/home/
 *           UpcomingEventsPreview.jsx, which showed events alone).
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
// Review #3726 / MEH-2859: a group buy's `deadline` is a NAIVE datetime —
// `GroupBuy.deadline = Column(DateTime)` (models.py:2352) with no UTC validator
// on GroupBuyOut, so the JSON carries no `Z` and `new Date()` reads it as the
// VISITOR's local time. lib/seo.js:31 states the rule and :821 already applies
// it to this very field; rescue closed the same hole at the schema instead
// (schemas/rescue.py:44 `UtcDatetimeOut`, whose comment names the bug).
import { parseNaiveUtc } from "@/lib/dates";
// The DST-aware Israel-wall-clock → instant converter, already used to build
// calendar files. An event's `event_time` is a wall clock in Israel, so this is
// what makes its sort key a real instant rather than one offset by 2-3h.
import { israelLocalToUtcStamp } from "@/lib/event-ics";
import { formatEventDate } from "@/lib/format-date";
import { israelNowParts } from "@/lib/orderWindow";

/** One phone screen of warning, as HomepageMiniMapLazy uses for the map. */
export const WHATS_ON_PRELOAD_MARGIN = "600px 0px";
export const WHATS_ON_MAX_ROWS = 3;

// REUSES: lib/rescue.js:39 rescueBagsEnabled() — read inline, exactly as
// lib/use-hub-nav-gate.js:29-32 does and for the same reason: importing
// lib/rescue.js pulls lib/generated/api.zod.js in with it, and this strip
// renders on the one page that sits under a Lighthouse budget (MEH-2850).
// Build-time constant; the string "true" only, as there.
const rescueOn = () => process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED === "true";

const HHMM_LENGTH = 5;
const MINUTES_PER_HOUR = 60;

/**
 * Israel-local HH:MM for an instant. A pickup window is a fact about a shop in
 * Israel, so it is never read in the visitor's own zone.
 *
 * Built on `israelNowParts`, one of the two sanctioned Israel-clock owners
 * (scripts/checks/israel-clock-guard.sh), rather than on a local
 * `Intl.DateTimeFormat` — which is what lib/rescue.js:90 does and what that
 * guard warns about there.
 *
 * Worth knowing when reading that guard: it greps for the zone name written
 * out as a timeZone option, so a private formatter that reached the zone
 * through a constant would have slipped past it. This file imports the owner
 * instead of relying on that gap. (Written around the pattern rather than
 * quoting it, for the reason rtl.md gives about z-index tokens in prose: a
 * comment that contains the pattern becomes a phantom finding of its own.)
 */
function israelTime(at) {
  if (!at) return null;
  const { minutes } = israelNowParts(at);
  const hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, "0");
  return `${hours}:${String(minutes % MINUTES_PER_HOUR).padStart(2, "0")}`;
}

/** "18:30:00" → "18:30". A row with no time renders its date instead. */
function hhmm(value) {
  return typeof value === "string" && value.length >= HHMM_LENGTH ? value.slice(0, HHMM_LENGTH) : null;
}

/**
 * DD.MM, read in Israel's zone so a deadline at 23:00 local keeps its own day
 * instead of rolling back for a reader whose clock is behind.
 *
 * The zone is an option handed to lib/format-date.js — the shared date
 * formatter — and not a second private implementation of the clock, which is
 * what israel-clock-guard is looking for. It is written as the plain zone name
 * rather than hidden behind a constant so that the guard sees this line at all;
 * the one-liner below is what it reads as the reason.
 */
function ddmm(at, locale) {
  // guard-ok: a timeZone option on the shared formatter — see the note above.
  // `at` is already a real instant, so toISOString() hands format-date.js a
  // zone-bearing string and its own `new Date()` cannot re-introduce the
  // local-time reading this whole module exists to avoid.
  return formatEventDate(at.toISOString(), locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ICS_STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * An Israel wall clock (`event_date` + `event_time`) → the instant it names.
 *
 * Every row in this strip is reduced to a real instant before it is sorted or
 * formatted, so neither the order nor the rendered date depends on the zone of
 * the machine doing the rendering. An earlier version of this file keyed the
 * wall clock AS IF it were UTC and documented a "~3h" error as an accepted
 * cost; that is not a cost worth taking when the DST-aware converter is one
 * import away.
 *
 * A date with no time is left at UTC midnight. Read back in Asia/Jerusalem
 * that is 02:00/03:00 the SAME day, so the rendered date is right and the row
 * sorts at the start of its own day, which is what a day-only row means.
 */
function israelWallClockInstant(dateIso, time) {
  if (typeof dateIso !== "string" || !ISO_DATE.test(dateIso)) return null;
  if (!time) return parseNaiveUtc(dateIso);
  const parts = ICS_STAMP.exec(israelLocalToUtcStamp(dateIso, time));
  if (!parts) return null;
  const at = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

// Rule 19: validate before consuming. One schema per source, naming only the
// fields a row reads — zod strips the rest, so a payload that grows a field
// does not fail here, while a payload missing a title or a date drops that ROW
// (the parse fails for it alone) instead of rendering a row with holes in it.
const Id = z.union([z.string(), z.number()]);
const DatedSchema = z.object({
  id: Id,
  title: z.string().min(1),
  event_date: z.string(),
  event_time: z.string().nullish(),
});
const GroupBuySchema = z.object({ id: Id, title: z.string().min(1), deadline: z.string() });
const BasketSchema = z.object({
  id: Id,
  date: z.string(),
  pickup_start: z.string().nullish(),
  producer: z.object({ name: z.string().min(1) }),
});

/**
 * The four types, in no particular order — `interleaveWhatsOn` decides what
 * reaches the screen.
 *
 * Only `/events/upcoming` takes a `limit`. The other three are narrowed
 * server-side by RECENCY (upcoming / open / today) but not by VOLUME: each
 * returns every matching row in full to render at most one line here. Capping
 * them needs a `limit` parameter on those endpoints, which is a backend change
 * and outside this card — stated so the next reader does not mistake "already
 * narrowed" for "already small".
 *
 * `at` is a real instant on every row, never a raw API string: see
 * `israelWallClockInstant` and `parseNaiveUtc` above for why that matters.
 */
const SOURCES = Object.freeze([
  {
    type: "event",
    endpoint: "/events/upcoming",
    params: { limit: WHATS_ON_MAX_ROWS },
    enabled: () => true,
    schema: DatedSchema,
    toEntry: (row) => ({
      key: `event-${row.id}`,
      type: "event",
      title: row.title,
      href: `/events/${row.id}`,
      at: israelWallClockInstant(row.event_date, row.event_time),
      time: hhmm(row.event_time),
    }),
  },
  {
    type: "experience",
    endpoint: "/experiences",
    enabled: () => true,
    schema: DatedSchema,
    toEntry: (row) => ({
      key: `experience-${row.id}`,
      type: "experience",
      title: row.title,
      href: `/experiences/${row.id}`,
      at: israelWallClockInstant(row.event_date, row.event_time),
      time: hhmm(row.event_time),
    }),
  },
  {
    type: "groupBuy",
    endpoint: "/group-buys",
    enabled: () => true,
    schema: GroupBuySchema,
    toEntry: (row) => ({
      key: `groupBuy-${row.id}`,
      type: "groupBuy",
      title: row.title,
      href: `/group-buys/${row.id}`,
      // parseNaiveUtc, NOT new Date(): the deadline carries no zone, so a bare
      // parse renders a visitor in Israel the WRONG DAY for any cut-off
      // between midnight and 03:00. See the import note at the top.
      at: parseNaiveUtc(row.deadline),
      // «עד DD.MM» — never a time, and never a countdown (MEH-2859 AC).
      time: null,
    }),
  },
  {
    type: "rescue",
    endpoint: "/rescue/offers",
    enabled: rescueOn,
    schema: BasketSchema,
    // The pilot has no per-bag page, so every basket row goes to the /rescue
    // list. Its name is the business's — a bag has no title of its own.
    toEntry: (row) => {
      // pickup_start DOES carry a zone (schemas/rescue.py:256 UtcDatetimeOut),
      // but it goes through the same parser as the deadline so no row in this
      // file depends on which of the two shapes an endpoint happens to send.
      const at = parseNaiveUtc(row.pickup_start) ?? parseNaiveUtc(row.date);
      return {
        key: `rescue-${row.id}`,
        type: "rescue",
        title: row.producer.name,
        href: "/rescue",
        at,
        time: israelTime(row.pickup_start ? at : null),
      };
    },
  },
]);

/**
 * Round-robin across the type buckets, soonest first inside each.
 *
 * Every entry is ranked by (depth within its own type, then date), so the
 * first pass takes the soonest of each type before any type gets a second
 * row. A plain date sort would let one busy calendar fill the strip, which is
 * the one thing the ticket asks this strip not to do.
 *
 * Module-private: it is covered through the rendered rows
 * (__tests__/HomeWhatsOn.test.jsx, the "row order" block), so exporting it
 * would widen the surface for nobody — which is what the Knip ratchet flagged.
 */
function interleaveWhatsOn(buckets, max = WHATS_ON_MAX_ROWS) {
  const ranked = [];
  for (const bucket of buckets) {
    [...bucket]
      .sort((a, b) => a.at - b.at)
      .forEach((entry, depth) => ranked.push({ entry, depth }));
  }
  ranked.sort((a, b) => a.depth - b.depth || a.entry.at - b.entry.at);
  return ranked.slice(0, max).map((ranking) => ranking.entry);
}

/** One source → its entries. Any failure is an empty bucket, never a throw. */
async function loadSource(source) {
  try {
    const res = await api.get(source.endpoint, source.params ? { params: source.params } : undefined);
    const rows = z.array(z.unknown()).safeParse(res?.data);
    if (!rows.success) return [];
    return rows.data
      .map((row) => {
        const parsed = source.schema.safeParse(row);
        if (!parsed.success) return null;
        const entry = source.toEntry(parsed.data);
        // A row whose date could not be turned into an instant has nothing to
        // sort by and nothing to show in the «when» column, so it is dropped
        // rather than rendered with a hole or sorted to the end by accident.
        return entry.at ? entry : null;
      })
      .filter(Boolean);
  } catch {
    // A quiet strip and an unreachable backend look the same to a reader, and
    // neither is an error she did anything about. The nav gates take the same
    // silent path (lib/use-hub-nav-gate.js:101-103).
    return [];
  }
}

const TYPE_LABEL_KEY = Object.freeze({
  event: "type.event",
  experience: "type.experience",
  groupBuy: "type.group_buy",
  rescue: "type.rescue",
});

function WhatsOnRow({ entry, labels }) {
  return (
    <li data-testid="whats-on-row" data-type={entry.type} className="border-b border-border last:border-b-0">
      <Link href={entry.href} className="flex items-baseline gap-3 py-3 transition hover:bg-surface-card">
        <span className="shrink-0 font-medium text-2xs text-accent">{labels.type(entry.type)}</span>
        <span className="min-w-0 flex-1 font-body-sm text-sm text-text line-clamp-1">{entry.title}</span>
        <span
          data-testid="whats-on-when"
          dir="ltr"
          className="shrink-0 font-headline-display font-bold text-sm text-fg-muted numeric"
        >
          {labels.when(entry)}
        </span>
      </Link>
    </li>
  );
}

export default function HomeWhatsOn() {
  const t = useTranslations("home.whats_on");
  const locale = useLocale();
  const sentinelRef = useRef(null);
  const [near, setNear] = useState(false);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (near) return undefined;
    // Deliberately a setState in the effect, not a lazy useState initialiser:
    // the server renders the sentinel, so deciding on the first render would
    // be a hydration mismatch (HomepageMiniMapLazy.jsx:40-42).
    if (typeof window.IntersectionObserver !== "function") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setNear(true);
      return undefined;
    }
    const el = sentinelRef.current;
    if (!el) return undefined;
    const observer = new window.IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: WHATS_ON_PRELOAD_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return undefined;
    let alive = true;
    const sources = SOURCES.filter((source) => source.enabled());
    Promise.all(sources.map(loadSource)).then((buckets) => {
      if (alive) setEntries(interleaveWhatsOn(buckets));
    });
    return () => {
      alive = false;
    };
  }, [near]);

  // Nothing across all four types ⇒ no section at all, not an empty heading.
  // This is also the pre-fetch state, which is why the sentinel is a sibling
  // of the section rather than something inside it.
  if (!entries.length) {
    return <div ref={sentinelRef} data-testid="home-whats-on-sentinel" aria-hidden="true" />;
  }

  const labels = {
    type: (type) => t(TYPE_LABEL_KEY[type]),
    when: (entry) =>
      entry.type === "groupBuy"
        ? t("until", { date: ddmm(entry.at, locale) })
        : entry.time || ddmm(entry.at, locale),
  };

  return (
    <section className="max-w-7xl mx-auto px-4 section-y border-t border-border" data-testid="home-whats-on">
      {/* The eyebrow + 32×1px gold rule + display heading of the «קטגוריות»
          section (HomeCategoryGrid.jsx:61-67) — same pattern, no new one. */}
      <span className="flex items-center gap-3 font-medium text-2xs text-accent mb-1">
        {t("eyebrow")}
        <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
      </span>
      <h2 className="font-headline-display text-headline-display text-text mb-6">{t("heading")}</h2>

      {/* The SECTION keeps max-w-7xl so its eyebrow and heading line up with
          «קטגוריות» and the businesses grid, but the row list is capped at a
          readable measure: at 1440 a full-width row left the time ~1100px from
          its own title. That is the same stranding MEH-2497 recorded for these
          rows ("a 1280px-wide row doesn't strand the price at the far end") and
          it is not worth re-learning. Block-level + max-width, so in RTL the
          list still starts at the heading's edge. */}
      <ul className="border-t border-border max-w-3xl">
        {entries.map((entry) => (
          <WhatsOnRow key={entry.key} entry={entry} labels={labels} />
        ))}
      </ul>

      <div className="mt-4">
        <Link href="/events" className="text-primary hover:underline text-sm">
          {t("all")}
        </Link>
      </div>
    </section>
  );
}
