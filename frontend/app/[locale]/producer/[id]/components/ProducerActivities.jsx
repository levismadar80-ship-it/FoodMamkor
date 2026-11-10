"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { CaretLeft } from "@phosphor-icons/react";
import api from "@/lib/api";
import { SEED_FILLS, SEED_PATH } from "@/lib/brand-seeds";
import { formatPrice } from "@/lib/utils";
import { groupBuyDiscountPct } from "@/lib/group-buy-progress";
import EventEntryRow, { toEventEntry } from "@/components/EventEntryRow";

// MEH-2602: the business page lists its open group buys and upcoming
// experiences, fetched client-side by producer_id; a failed fetch or an empty
// list hides the section.
//
// MEH #2659 (Sapir, 04/11 — proposal https://claude.ai/artifact/3KGkJqw9im6RWKNv4x3hHr):
// - Events and experiences are ONE date-sorted list, drawn with the home
//   page's EventEntryRow, under the existing «אירועים קרובים» heading. They
//   used to be two lists of grey one-line cards with different headings.
// - The business name is dropped from each row (it is the page's own title),
//   and so is the owner photo fallback (it is the page's own hero).
// - A group buy is a compact card with no photo: the 16:9 photo on the hub
//   card is the business's own image, which this page already shows at the
//   top. The hub card (GroupBuysClient.jsx GroupBuyCard) is unchanged.
const EVENTS_PREVIEW = 3;
// MEH-2827 PR 7 (board FinalGroupBuyFlow, Sapir 08/11): two group buys, the
// rest behind the same show-all text button the events use. Order unchanged.
const GROUP_BUYS_PREVIEW = 2;

// MEH-2827 PR 7: progress toward the group price, drawn in the logo's seeds.
// Up to SEEDS_MAX participants → one seed each, filled in the logo colours in
// order; more → five segments, each a fifth of the target, the current one
// partly filled. One mark for the business-page card and the group-buy page.
// The five fixed petal colours of public/logo.svg, in logo order (MEH-2833:
// from the seed layer's one source, lib/brand-seeds.js).
const SEED_COLORS = SEED_FILLS;
const SEEDS_MAX = 10;
const BAR_SEGMENTS = 5;
// lg seeds shrink to fit (max 30×46): ten of them at 30px would need 336px,
// and the progress box is ~280px wide at 375.
const MARK_SIZE = {
  sm: { seed: [13, 20], seeds: "gap-0.5", bar: "gap-[3px]", segment: "h-1.5 w-3.5" },
  lg: { seed: null, seeds: "gap-1 w-full", bar: "gap-1 w-full", segment: "h-3 flex-1" },
};
// On the group page, up to this many seeds sit beside the count; more go
// under it, full width, like the bar.
export const SEEDS_BESIDE_TEXT = 5;

/**
 * @param {object} props
 * @param {number} props.commits
 * @param {number} props.min      the target (min_participants)
 * @param {boolean} [props.funded] all filled once the group price opened
 * @param {string} props.label    accessible name (progress_label)
 * @param {"sm"|"lg"} [props.size]
 */
export function GroupBuyProgressMark({ commits, min, funded = false, label, size = "sm" }) {
  const target = Math.max(0, Number(min) || 0);
  const got = funded ? target : Math.min(Math.max(0, Number(commits) || 0), target);
  const s = MARK_SIZE[size] ?? MARK_SIZE.sm;
  if (target === 0) return null;

  if (target <= SEEDS_MAX) {
    const [w, h] = s.seed ?? ["100%", undefined];
    return (
      <span role="img" aria-label={label} data-testid="gb-progress-seeds" className={`flex items-end ${s.seeds}`}>
        {Array.from({ length: target }, (_, i) => (
          <svg
            key={i}
            width={w}
            height={h}
            viewBox="-14 -46 28 42"
            aria-hidden="true"
            data-filled={i < got ? "true" : "false"}
            className={s.seed ? undefined : "min-w-0 flex-1 max-w-[30px]"}
          >
            {i < got ? (
              <>
                <path d={SEED_PATH} fill={SEED_COLORS[i % SEED_COLORS.length]} />
                {size === "lg" && <ellipse cx="-3" cy="-32" rx="2.5" ry="6" className="fill-background" opacity="0.35" />}
              </>
            ) : (
              <path d={SEED_PATH} fill="none" className="stroke-primary" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="5 4" />
            )}
          </svg>
        ))}
      </span>
    );
  }

  const per = target / BAR_SEGMENTS;
  return (
    <span role="img" aria-label={label} data-testid="gb-progress-bar" className={`flex ${s.bar}`}>
      {Array.from({ length: BAR_SEGMENTS }, (_, i) => {
        const fill = Math.round(Math.max(0, Math.min(1, (got - i * per) / per)) * 100);
        return (
          <span key={i} className={`block overflow-hidden rounded-full bg-border ${s.segment}`}>
            <span className="block h-full rounded-full" data-fill={fill} style={{ width: `${fill}%`, background: SEED_COLORS[i] }} />
          </span>
        );
      })}
    </span>
  );
}

const noT = () => "";

function byDateTime(a, b) {
  const ka = `${a.date || ""}T${a.time || ""}`;
  const kb = `${b.date || ""}T${b.time || ""}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function GroupBuyRow({ gb }) {
  const t = useTranslations("group_buys.card");
  const td = useTranslations("group_buys.detail");
  const funded = gb.status === "funded";
  const daysLeft = Math.max(0, Math.ceil((new Date(gb.deadline) - Date.now()) / 86400000));
  const discount = groupBuyDiscountPct(gb.price_per_unit_regular, gb.price_per_unit_group);
  const remaining = Math.max(0, gb.min_participants - gb.commits_count);
  const progress = t("progress_label", { commits: gb.commits_count, min: gb.min_participants });

  // MEH-2827 PR 7: a SMALL card, and the whole card is the one link to the
  // group's page — no buttons inside (joining and sharing live there).
  return (
    <Link
      href={`/group-buys/${gb.id}`}
      data-testid="producer-group-buy-row"
      className="flex rounded-2xl border border-border bg-surface-card p-4 hover:border-primary transition focus-ring"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-headline-md text-lg font-bold text-text leading-snug line-clamp-2 min-w-0">{gb.title}</h3>
          {/* Forward caret: points left in Hebrew, flipped to point right in English. */}
          <CaretLeft size={20} aria-hidden="true" className="text-primary shrink-0 mt-1 ltr:rotate-180" />
        </div>
        {gb.product_name && (
          <p className="text-sm text-fg-muted" data-testid="group-buy-product-name">{gb.product_name}</p>
        )}
        <p className="mt-2 flex items-baseline gap-2">
          <span dir="ltr" className="font-headline-md text-2xl font-black text-primary leading-none">
            {formatPrice(Number(gb.price_per_unit_group).toFixed(0))}
          </span>
          <span dir="ltr" className="text-sm text-fg-muted line-through">
            {formatPrice(Number(gb.price_per_unit_regular).toFixed(0))}
          </span>
          {gb.unit && <span className="text-xs text-fg-muted">{t("unit_prefix", { unit: gb.unit })}</span>}
        </p>
        {discount > 0 && (
          <p className="mt-1 text-xs font-semibold text-gold-deep" data-testid="group-buy-saving">
            {td("discount_hint", { discount })}
          </p>
        )}
        {/* flex-wrap: ten seeds + a long count can exceed a 375 card; the days
            then drop under the count instead of overflowing. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-background-alt px-2.5 py-2">
          <span className="flex items-center gap-2 min-w-0">
            <GroupBuyProgressMark commits={gb.commits_count} min={gb.min_participants} funded={funded} label={progress} />
            <span
              className={`text-xs font-bold ${funded ? "text-primary" : "text-text"}`}
              data-testid="group-buy-progress-line"
            >
              {funded ? t("funded_banner") : remaining === 0 ? progress : td("remaining_to_open", { n: remaining })}
            </span>
          </span>
          <span className="text-xs text-fg-muted shrink-0">
            {daysLeft > 0 ? t("days_left", { days: daysLeft }) : t("expired")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ProducerActivities({ producerId, events = [], sectionRefs }) {
  const t = useTranslations("producer.detail.sections");
  const [groupBuys, setGroupBuys] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [showAllGroupBuys, setShowAllGroupBuys] = useState(false);

  useEffect(() => {
    if (!producerId) return undefined;
    let cancelled = false;
    const id = encodeURIComponent(producerId);
    api
      .get(`/group-buys?producer_id=${id}`)
      .then((res) => {
        if (!cancelled) setGroupBuys(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {});
    api
      .get(`/experiences?producer_id=${id}`)
      .then((res) => {
        if (!cancelled) setExperiences(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [producerId]);

  const entries = useMemo(() => {
    const list = [
      ...events.map((ev) => toEventEntry(ev, "events", noT)),
      ...experiences.map((ex) => toEventEntry(ex, "experiences", noT)),
    ].map((e) => ({ ...e, who: null, ownerImage: null }));
    return list.sort(byDateTime);
  }, [events, experiences]);

  const shown = showAll ? entries : entries.slice(0, EVENTS_PREVIEW);

  return (
    <>
      {entries.length > 0 && (
        <section
          className="mt-12"
          data-testid="producer-events"
          ref={(el) => {
            if (sectionRefs) sectionRefs.current.events = el;
          }}
        >
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{t("events.heading")}</h2>
          <div className="border-t border-border">
            {shown.map((entry) => (
              <EventEntryRow key={`${entry.accent}-${entry.id}`} entry={entry} freeLabel={t("events.free")} />
            ))}
          </div>
          {entries.length > EVENTS_PREVIEW && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 text-sm text-primary hover:text-primary-dark font-medium underline"
            >
              {t("events.show_all_count", { count: entries.length })}
            </button>
          )}
        </section>
      )}

      {groupBuys.length > 0 && (
        <section className="mt-12" id="group-buys" data-testid="producer-group-buys">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("group_buys.heading")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(showAllGroupBuys ? groupBuys : groupBuys.slice(0, GROUP_BUYS_PREVIEW)).map((gb) => (
              <GroupBuyRow key={gb.id} gb={gb} />
            ))}
          </div>
          {groupBuys.length > GROUP_BUYS_PREVIEW && !showAllGroupBuys && (
            <button
              type="button"
              onClick={() => setShowAllGroupBuys(true)}
              data-testid="group-buys-show-all"
              className="mt-4 text-sm text-primary hover:text-primary-dark font-medium underline"
            >
              {t("group_buys.show_all")}
            </button>
          )}
        </section>
      )}
    </>
  );
}
