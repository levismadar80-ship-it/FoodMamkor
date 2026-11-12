"use client";

/**
 * Module:   HomeWhatsOn
 * Purpose:  MEH-2859 — one home strip for everything date-bound at the
 *           businesses: events, experiences, group buys and surprise baskets.
 *           MEH-2962: three rows of picture cards instead of three text rows —
 *           events + experiences together (soonest first, one per type before
 *           a type repeats, so a busy events calendar cannot take the row),
 *           then group buys, then surprise baskets, the last two each under
 *           its own heading and one-line explanation. A row with nothing in it
 *           is not rendered.
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
 *           UpcomingEventsPreview.jsx, which showed events alone) ·
 *           MEH-2962 (cards with pictures, three rows; Sapir 12/11).
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";

import { ArrowLeft, CalendarBlank, ShoppingBag, UsersThree } from "@phosphor-icons/react";

import Seed from "@/components/brand/Seed";
// The category glyphs of the date-rail rows (/events, the business page), so a
// card here and a row there read as one family.
import { CATEGORY_ICON, PRICE_BASE } from "@/components/EventEntryRow";
import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
import { seedColorFor } from "@/lib/brand-seeds";
import { IMAGE_RATIOS, optimizeCloudinary } from "@/lib/cloudinary";
import { cssUrl } from "@/lib/css-url";
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
import { EVENT_CATEGORIES, findExperienceCategory } from "@/lib/event-categories";
import { israelLocalToUtcStamp } from "@/lib/event-ics";
import { eventWhen } from "@/lib/event-when";
import { formatEventDate } from "@/lib/format-date";
import { israelNowParts } from "@/lib/orderWindow";
import { formatPrice } from "@/lib/utils";

/** One phone screen of warning, as HomepageMiniMapLazy uses for the map. */
export const WHATS_ON_PRELOAD_MARGIN = "600px 0px";
// MEH-2962: cards per row. A phone scrolls sideways through all of them; from
// lg the row is a 3-up grid and shows the first three.
export const WHATS_ON_MAX_CARDS = 6;
const AGOROT_PER_SHEKEL = 100;

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
// MEH-2962: everything a card adds (picture, business, town, category, price)
// is `.nullish()` — a row is dropped for a missing title or date, never for a
// missing picture.
const Price = z.union([z.number(), z.string()]).nullish();
const Text = z.string().nullish();
const DatedSchema = z.object({
  id: Id,
  title: z.string().min(1),
  event_date: z.string(),
  event_time: z.string().nullish(),
  category: Text,
  city: Text,
  image_url: Text,
  // events
  producer_id: Id.nullish(),
  producer_name: Text,
  owner_image_url: Text,
  price: Price,
  // experiences
  price_per_person: Price,
  host: z.object({ producer_name: Text, name: Text }).nullish(),
});
const GroupBuySchema = z.object({
  id: Id,
  title: z.string().min(1),
  deadline: z.string(),
  producer_id: Id.nullish(),
  producer_name: Text,
  producer_image_url: Text,
  city: Text,
  price_per_unit_group: Price,
  price_per_unit_regular: Price,
});
const BasketSchema = z.object({
  id: Id,
  date: z.string(),
  pickup_start: z.string().nullish(),
  pickup_end: z.string().nullish(),
  price_agorot: z.number().nullish(),
  producer: z.object({
    id: Id.nullish(),
    name: z.string().min(1),
    city: Text,
    image_url: Text,
  }),
});

/** A price that is a positive number, else null (free / unknown). */
function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The four types, in no particular order — `interleaveWhatsOn` decides what
 * reaches the screen.
 *
 * Only `/events/upcoming` takes a `limit`. The other three are narrowed
 * server-side by RECENCY (upcoming / open / today) but not by VOLUME: each
 * returns every matching row in full to render at most WHATS_ON_MAX_CARDS here. Capping
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
    params: { limit: WHATS_ON_MAX_CARDS },
    enabled: () => true,
    schema: DatedSchema,
    toEntry: (row) => ({
      key: `event-${row.id}`,
      type: "event",
      title: row.title,
      href: `/events/${row.id}`,
      at: israelWallClockInstant(row.event_date, row.event_time),
      time: hhmm(row.event_time),
      day: row.event_date,
      category: row.category || null,
      // The event's own photo, else its owner's first photo (MEH-2546).
      image: row.image_url || row.owner_image_url || null,
      who: row.producer_name || null,
      plate: row.producer_name || null,
      city: row.city || null,
      seedId: row.producer_id ?? row.id,
      price: positive(row.price),
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
      day: row.event_date,
      category: row.category || null,
      image: row.image_url || null,
      who: row.host?.producer_name || row.host?.name || null,
      plate: row.host?.producer_name || row.host?.name || null,
      city: row.city || null,
      seedId: row.id,
      price: positive(row.price_per_person),
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
      image: row.producer_image_url || null,
      who: row.producer_name || null,
      plate: row.producer_name || null,
      city: row.city || null,
      seedId: row.producer_id ?? row.id,
      price: positive(row.price_per_unit_group),
      priceWas: positive(row.price_per_unit_regular),
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
        timeEnd: israelTime(parseNaiveUtc(row.pickup_end)),
        day: row.date,
        image: row.producer.image_url || null,
        // The card's title IS the business, so the line under it is the town
        // — and a basket with no photo gets the seed alone, not the business
        // name on the plate and again as the title right under it.
        who: null,
        plate: null,
        city: row.producer.city || null,
        seedId: row.producer.id ?? row.id,
        price: positive(row.price_agorot) ? row.price_agorot / AGOROT_PER_SHEKEL : null,
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
function interleaveWhatsOn(buckets, max = WHATS_ON_MAX_CARDS) {
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

/**
 * The picture, or — with none — the business's name on the warm plate with one
 * seed in its own colour (DESIGN.md «No photo», MEH-2833: the same plate
 * replaces every missing event image). The seed sits in the END-top corner
 * because the date tile takes the start-top one (MEH-2844: a seed never sits
 * under or against a control).
 */
function CardPicture({ entry, children }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-background-alt" aria-hidden="true">
      {entry.image ? (
        <div
          data-testid="whats-on-image"
          className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.02]"
          style={{
            backgroundImage: cssUrl(
              optimizeCloudinary(entry.image, {
                aspectRatio: IMAGE_RATIOS.strip,
                width: 640,
              }),
            ),
          }}
        />
      ) : (
        // The plate names the BUSINESS; an entry with no business to name
        // gets the seed alone (DESIGN.md: «image-only slots get the seed
        // alone») rather than its own title a second time.
        <div data-testid="whats-on-plate" className="absolute inset-0 flex flex-col justify-end p-3">
          <Seed
            color={seedColorFor(entry.seedId).fill}
            size={70}
            rotate={-36}
            highlight
            className="absolute -top-[46px] -end-[30px] pointer-events-none ltr:-scale-x-100"
          />
          <span className="relative font-headline-lg font-black text-2xl leading-[1.05] text-text line-clamp-2 [word-break:keep-all] [overflow-wrap:anywhere]">
            {entry.plate}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

/** Month over day, as on the event page's own tile (EventDetailClient). */
function DateTile({ at, locale }) {
  // guard-ok: a timeZone option on the shared formatter — see `ddmm` above.
  const part = (options) =>
    formatEventDate(at.toISOString(), locale, {
      ...options,
      timeZone: "Asia/Jerusalem",
    });
  return (
    <div
      data-testid="whats-on-date-tile"
      className="absolute top-2 start-2 w-12 overflow-hidden rounded-sm border border-border bg-surface-card text-center"
    >
      <span className="block bg-primary py-0.5 text-2xs font-bold text-white">{part({ month: "short" })}</span>
      <span className="block font-headline-display text-xl font-black leading-tight text-text numeric">
        {part({ day: "numeric" })}
      </span>
    </div>
  );
}

function WhatsOnCard({ entry, labels }) {
  const dated = entry.type === "event" || entry.type === "experience";
  const label = dated ? labels.category(entry) : null;
  const Icon = dated ? (CATEGORY_ICON[entry.category] ?? CalendarBlank) : null;
  const meta = [entry.who, entry.city].filter(Boolean).join(" · ");
  const price = labels.price(entry);
  return (
    <li
      data-testid="whats-on-row"
      data-type={entry.type}
      className="w-[74%] shrink-0 snap-start sm:w-80 lg:w-auto lg:[&:nth-child(n+4)]:hidden"
    >
      <Link
        href={entry.href}
        className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface-card transition hover:border-primary"
      >
        <CardPicture entry={entry}>{dated ? <DateTile at={entry.at} locale={labels.locale} /> : null}</CardPicture>
        <div className="flex flex-1 flex-col p-3">
          <span className="flex flex-1 flex-col pb-2">
            {label && (
              <span
                data-testid="whats-on-label"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
              >
                <Icon size={12} weight="bold" aria-hidden="true" />
                {label}
              </span>
            )}
            <span className="mt-0.5 font-headline-md text-lg font-bold leading-snug text-text line-clamp-2 group-hover:text-primary">
              {entry.title}
            </span>
            {meta && <span className="mt-0.5 text-sm text-fg-muted line-clamp-1">{meta}</span>}
          </span>
          <span className="flex items-baseline justify-between gap-2 border-t border-border pt-2">
            {/* The calendar tile is decoration to assistive tech (the picture
                is aria-hidden), so the date itself is said here. sr-only is
                position:absolute — the card link is `relative` so that a card
                scrolled off-screen does not widen the page with it. */}
            {dated ? (
              <span data-testid="whats-on-date-spoken" className="sr-only">
                {labels.date(entry)}
              </span>
            ) : null}
            <span data-testid="whats-on-when" className="text-sm font-medium text-primary">
              {labels.when(entry)}
            </span>
            {/* No price on record: the footer keeps the height a price gives
                it, so the divider sits level across a row of cards. */}
            {!price && (
              <span className={`${PRICE_BASE} invisible`} aria-hidden="true">
                &nbsp;
              </span>
            )}
            {price && (
              <span data-testid="whats-on-price" className="flex items-baseline gap-1.5">
                {entry.priceWas && entry.priceWas > entry.price ? (
                  <span dir="ltr" className="text-xs text-fg-muted line-through numeric">
                    {formatPrice(entry.priceWas)}
                  </span>
                ) : null}
                <span dir={entry.price ? "ltr" : undefined} className={`${PRICE_BASE} text-text`}>
                  {price}
                </span>
              </span>
            )}
          </span>
        </div>
      </Link>
    </li>
  );
}

/**
 * One row: heading, an optional one-line explanation, the cards, the link.
 * Every row's heading is an h2: the rows are siblings, and which of them
 * renders first depends on supply.
 */
function WhatsOnGroup({ group, first, labels }) {
  return (
    <div data-testid="whats-on-group" data-group={group.id} className={first ? "" : "mt-10"}>
      {/* One size for all three: at 375 the display size broke the first
          heading over two lines and made the rows under it read as its
          children rather than its siblings. */}
      <h2 className="font-headline-lg text-headline-lg font-black text-text">
        {/* The two rows a visitor may not know by name carry the glyph their
            tool already has in the dashboard (tools/page.js:179, :193). */}
        {group.Icon && (
          <group.Icon
            data-testid="whats-on-group-icon"
            size="0.9em"
            className="me-2 inline-block align-[-0.12em] text-primary"
            aria-hidden="true"
          />
        )}
        {group.heading}
      </h2>
      {group.lead && <p className="mt-1 text-sm text-fg-muted">{group.lead}</p>}
      {/* A phone scrolls the row sideways (the «קטגוריות» strip's own classes,
          HomeCategoryGrid.jsx:77); from lg it is a 3-up grid whose cards keep a
          third of the width — one card does not stretch across the page. */}
      <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-proximity -mx-4 px-4 scroll-px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {group.entries.map((entry) => (
          <WhatsOnCard key={entry.key} entry={entry} labels={labels} />
        ))}
      </ul>
      <div className="mt-1">
        {/* DESIGN.md «Text links look tappable without hover» (MEH-2831): a
            phone has no hover, so the underline and the arrow are permanent.
            Same treatment as the home grid's own text link
            (HomeProducersGrid.jsx:633), and a 44px tap height. */}
        <Link
          href={group.allHref}
          className="inline-flex items-center gap-1 min-h-touch text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {group.all}
          <ArrowLeft size={15} className="ltr:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

const EMPTY_ROWS = Object.freeze({ go: [], groupBuy: [], rescue: [] });

export default function HomeWhatsOn() {
  const t = useTranslations("home.whats_on");
  // MEH-2962: every string a card or a row heading shows already exists under
  // its own feature — nothing here is new copy.
  const tEvents = useTranslations("events");
  const tGroupBuys = useTranslations("group_buys.list");
  const tRescue = useTranslations("rescue.home");
  const tProducerGroupBuys = useTranslations("producer.detail.sections.group_buys");
  const locale = useLocale();
  const sentinelRef = useRef(null);
  const [near, setNear] = useState(false);
  const [rows, setRows] = useState(EMPTY_ROWS);

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
      if (!alive) return;
      const of = (type) => buckets[sources.findIndex((source) => source.type === type)] ?? [];
      const soonest = (bucket) => [...bucket].sort((a, b) => a.at - b.at).slice(0, WHATS_ON_MAX_CARDS);
      setRows({
        // Events and experiences share a row: both are "be there on a date".
        go: interleaveWhatsOn([of("event"), of("experience")]),
        groupBuy: soonest(of("groupBuy")),
        rescue: soonest(of("rescue")),
      });
    });
    return () => {
      alive = false;
    };
  }, [near]);

  // One row per kind of thing, in this order; a row with no entries is dropped
  // here, so its heading and its explanation go with it.
  const groups = [
    {
      id: "go",
      heading: t("heading"),
      lead: null,
      all: t("all"),
      allHref: "/events",
      entries: rows.go,
    },
    {
      id: "groupBuy",
      Icon: UsersThree,
      heading: tGroupBuys("hero_title"),
      lead: tGroupBuys("hero_subtitle"),
      // Not «לכל מה שקורה» a second time: two links with one name and two
      // destinations is what a screen-reader's link list cannot tell apart.
      all: tProducerGroupBuys("show_all"),
      allHref: "/group-buys",
      entries: rows.groupBuy,
    },
    {
      id: "rescue",
      Icon: ShoppingBag,
      heading: tRescue("title"),
      lead: tRescue("lead"),
      all: tRescue("all"),
      allHref: "/rescue",
      entries: rows.rescue,
    },
  ].filter((group) => group.entries.length > 0);

  // Nothing across all four types ⇒ no section at all, not an empty heading.
  // This is also the pre-fetch state, which is why the sentinel is a sibling
  // of the section rather than something inside it.
  if (!groups.length) {
    return <div ref={sentinelRef} data-testid="home-whats-on-sentinel" aria-hidden="true" />;
  }

  // «היום» / «מחר» for a date that close, else the weekday (events and
  // experiences) or DD.MM (a basket) — read in Israel's zone either way.
  const dayWord = (entry, fallback) => {
    const when = eventWhen(entry.day);
    if (when === "today") return tEvents("detail.when_today");
    if (when === "tomorrow") return tEvents("detail.when_tomorrow");
    return fallback();
  };
  // guard-ok: a timeZone option on the shared formatter — see `ddmm` above.
  const weekday = (entry) =>
    formatEventDate(entry.at.toISOString(), locale, {
      weekday: "long",
      timeZone: "Asia/Jerusalem",
    });
  const withTime = (day, time) => (
    <>
      {day}
      {time ? (
        <>
          {" · "}
          <span dir="ltr" className="numeric">
            {time}
          </span>
        </>
      ) : null}
    </>
  );

  const labels = {
    locale,
    // The category a visitor knows («סדנה», «שוק») rather than our own split
    // into event / experience; «אחר» and anything unmapped fall back to it.
    category: (entry) => {
      if (entry.type === "experience") {
        const found = findExperienceCategory(entry.category);
        return found && found.labelKey !== "other"
          ? tEvents(`experience_categories.${found.labelKey}`)
          : t(TYPE_LABEL_KEY.experience);
      }
      const found = EVENT_CATEGORIES.find((c) => c.key === entry.category);
      return found && found.labelKey !== "other" ? tEvents(`categories.${found.labelKey}`) : t(TYPE_LABEL_KEY.event);
    },
    date: (entry) => ddmm(entry.at, locale),
    when: (entry) => {
      if (entry.type === "groupBuy") return t("until", { date: ddmm(entry.at, locale) });
      if (entry.type === "rescue") {
        const window = entry.time && entry.timeEnd ? `${entry.time}–${entry.timeEnd}` : entry.time;
        return withTime(
          dayWord(entry, () => ddmm(entry.at, locale)),
          window,
        );
      }
      return withTime(
        dayWord(entry, () => weekday(entry)),
        entry.time,
      );
    },
    // Free is stated only where "free" is a real offer — an event or an
    // experience. A group buy or a basket with no price shows none.
    price: (entry) => {
      if (entry.price) return formatPrice(entry.price);
      return entry.type === "event" || entry.type === "experience" ? tEvents("list.free") : null;
    },
  };

  return (
    <section className="max-w-7xl mx-auto px-4 section-y border-t border-border" data-testid="home-whats-on">
      {/* The eyebrow + 32×1px gold rule + display heading of the «קטגוריות»
          section (HomeCategoryGrid.jsx:61-67) — same pattern, no new one. */}
      <span className="flex items-center gap-3 font-medium text-2xs text-accent mb-1">
        {t("eyebrow")}
        <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
      </span>
      {groups.map((group, index) => (
        <WhatsOnGroup key={group.id} group={group} first={index === 0} labels={labels} />
      ))}
    </section>
  );
}
