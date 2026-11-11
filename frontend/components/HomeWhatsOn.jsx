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
function israelTime(iso) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
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
function ddmm(iso, locale) {
  // guard-ok: a timeZone option on the shared formatter — see the note above.
  return formatEventDate(iso, locale, { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });
}

/**
 * Sort key, in UTC on purpose.
 *
 * A date-plus-wall-clock row ("2026-08-15" + "18:30:00") is read as UTC rather
 * than as the runner's local zone: a local parse would make the ORDER of the
 * strip depend on the machine rendering it, which is the clock-dependency
 * .claude/rules/testing.md rules out. The cost is that an event's wall clock
 * is treated as UTC while a deadline and a pickup window are true instants, so
 * two rows of DIFFERENT types within ~3h of each other can swap places. That
 * bound is accepted: the strip answers "what is coming up", not "which of
 * these two is 90 minutes sooner".
 */
function sortKey(dateOrInstant, time) {
  const raw = typeof dateOrInstant === "string" ? dateOrInstant : "";
  if (!raw) return Number.POSITIVE_INFINITY;
  const iso = raw.includes("T") ? raw : `${raw}T${time || "00:00:00"}Z`;
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
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
 * reaches the screen. `limit` is sent only where the endpoint takes one; the
 * other three are already narrowed server-side (upcoming / open / today).
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
      date: row.event_date,
      time: hhmm(row.event_time),
      sortAt: sortKey(row.event_date, row.event_time),
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
      date: row.event_date,
      time: hhmm(row.event_time),
      sortAt: sortKey(row.event_date, row.event_time),
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
      date: row.deadline,
      // «עד DD.MM» — never a time, and never a countdown (MEH-2859 AC).
      time: null,
      sortAt: sortKey(row.deadline),
    }),
  },
  {
    type: "rescue",
    endpoint: "/rescue/offers",
    enabled: rescueOn,
    schema: BasketSchema,
    // The pilot has no per-bag page, so every basket row goes to the /rescue
    // list. Its name is the business's — a bag has no title of its own.
    toEntry: (row) => ({
      key: `rescue-${row.id}`,
      type: "rescue",
      title: row.producer.name,
      href: "/rescue",
      date: row.date,
      time: israelTime(row.pickup_start),
      sortAt: sortKey(row.pickup_start || row.date),
    }),
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
      .sort((a, b) => a.sortAt - b.sortAt)
      .forEach((entry, depth) => ranked.push({ entry, depth }));
  }
  ranked.sort((a, b) => a.depth - b.depth || a.entry.sortAt - b.entry.sortAt);
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
        return parsed.success ? source.toEntry(parsed.data) : null;
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
        ? t("until", { date: ddmm(entry.date, locale) })
        : entry.time || ddmm(entry.date, locale),
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

      <ul className="border-t border-border">
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
