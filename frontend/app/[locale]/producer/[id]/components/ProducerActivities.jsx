"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import api from "@/lib/api";
import { IMAGE_RATIOS } from "@/lib/cloudinary";
import { formatPrice } from "@/lib/utils";
import ImageWithFallback from "@/components/ImageWithFallback";
import { GroupBuyCard } from "@/app/[locale]/group-buys/GroupBuysClient";

// MEH-2602: the business page listed its events but not its open group buys
// or upcoming experiences — both existed only on their hub pages, so a
// visitor on the page never learned the business ran one. Fetched
// client-side (like the recipes section) by producer_id; each section is
// hidden when its list is empty, and a failed fetch hides it too.
// REUSES: app/[locale]/group-buys/GroupBuysClient.jsx GroupBuyCard;
// the events card markup in ProducerSections.jsx for experiences.
export default function ProducerActivities({ producerId }) {
  const t = useTranslations("producer.detail.sections");
  const format = useFormatter();
  const [groupBuys, setGroupBuys] = useState([]);
  const [experiences, setExperiences] = useState([]);

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

  return (
    <>
      {groupBuys.length > 0 && (
        <section className="mt-8" id="group-buys" data-testid="producer-group-buys">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("group_buys.heading")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {groupBuys.map((gb) => (
              <GroupBuyCard key={gb.id} gb={gb} />
            ))}
          </div>
        </section>
      )}

      {experiences.length > 0 && (
        <section className="mt-8" id="experiences" data-testid="producer-experiences">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("experiences.heading")}
          </h2>
          <div className="space-y-3">
            {experiences.map((ex) => {
              const dateStr = format.dateTime(new Date(ex.event_date), {
                weekday: "short", day: "numeric", month: "long",
              });
              const timeStr = ex.event_time ? ex.event_time.slice(0, 5) : null;
              const price = Number(ex.price_per_person);
              return (
                <Link
                  key={ex.id}
                  href={`/experiences/${ex.id}`}
                  className="bg-white rounded-md border border-border p-4 flex gap-4 transition-colors duration-base ease-quart hover:border-primary focus-ring"
                >
                  {ex.image_url && (
                    <ImageWithFallback
                      src={ex.image_url}
                      alt={ex.title}
                      aspectRatio={IMAGE_RATIOS.square}
                      optimizeWidth={128}
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-sm object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text leading-snug">{ex.title}</p>
                    <p className="text-sm text-fg-muted mt-0.5">
                      {dateStr}{timeStr && ` · ${timeStr}`}
                      {ex.city && ` · ${ex.city}`}
                    </p>
                    <p className="text-sm text-accent font-medium mt-1">
                      {price > 0 ? <span dir="ltr">{formatPrice(price)}</span> : t("experiences.free")}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
