"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Clock } from "@phosphor-icons/react";
import api from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { groupBuyProgressPct, groupBuyDiscountPct } from "@/lib/group-buy-progress";
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
  const pct = groupBuyProgressPct(gb.commits_count, gb.min_participants);
  const daysLeft = Math.max(0, Math.ceil((new Date(gb.deadline) - Date.now()) / 86400000));
  const discount = groupBuyDiscountPct(gb.price_per_unit_regular, gb.price_per_unit_group);
  const remaining = Math.max(0, gb.min_participants - gb.commits_count);

  return (
    <Link
      href={`/group-buys/${gb.id}`}
      data-testid="producer-group-buy-row"
      className="bg-white rounded-[14px] border border-border px-4 py-3 flex flex-col gap-2 hover:border-primary transition focus-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-headline-md text-lg font-bold text-text leading-snug line-clamp-2 min-w-0">
          {gb.title}
        </h3>
        {funded ? (
          <span className="shrink-0 bg-green-50 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
            {t("funded_banner")}
          </span>
        ) : discount > 0 ? (
          <span
            dir="ltr"
            data-testid="group-buy-discount"
            className="shrink-0 bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full"
          >
            -{discount}%
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {gb.product_name ? (
          <span className="text-sm text-text min-w-0" data-testid="group-buy-product-name">
            {gb.product_name}
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-baseline gap-2">
          <span dir="ltr" className="text-xl font-bold text-primary">
            {formatPrice(Number(gb.price_per_unit_group).toFixed(0))}
          </span>
          <span dir="ltr" className="text-sm text-fg-muted line-through">
            {formatPrice(Number(gb.price_per_unit_regular).toFixed(0))}
          </span>
          {gb.unit && <span className="text-xs text-fg-muted">{t("unit_prefix", { unit: gb.unit })}</span>}
        </span>
      </div>

      <div className="w-full bg-border rounded-full h-1.5 overflow-hidden" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-text" data-testid="group-buy-progress-line">
          {funded || remaining === 0
            ? t("progress_label", { commits: gb.commits_count, min: gb.min_participants })
            : td("remaining_to_open", { n: remaining })}
        </span>
        <span className="inline-flex items-center gap-1 text-fg-muted shrink-0">
          <Clock size={14} aria-hidden="true" />
          {daysLeft > 0 ? t("days_left", { days: daysLeft }) : t("expired")}
        </span>
      </div>
    </Link>
  );
}

export default function ProducerActivities({ producerId, events = [], sectionRefs }) {
  const t = useTranslations("producer.detail.sections");
  const [groupBuys, setGroupBuys] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [showAll, setShowAll] = useState(false);

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
            {groupBuys.map((gb) => (
              <GroupBuyRow key={gb.id} gb={gb} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
