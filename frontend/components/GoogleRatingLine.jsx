"use client";

/**
 * GoogleRatingLine — MEH-1490
 *
 * One quiet, muted trust line on a producer page: "★ 4.7 · 128 ביקורות ב-Google
 * Maps", linking out to the business's Google Maps profile. NOT a scoreboard,
 * NOT a "from the web" tab — a single detached footnote below the native review
 * block (the caller places the separator).
 *
 * Data is live-fetched from our own backend proxy (GET /producers/{id}/
 * google-rating), which talks to Google server-side and NEVER persists the
 * rating/count (Google Maps Platform ToS §3.2.3(b) No Caching). The endpoint
 * returns 204 whenever the line must not render (no mapped place_id, < 20
 * Google reviews, API error, or no server key) — so this component renders
 * NOTHING in every non-eligible case: no placeholder, no layout hole.
 *
 * Attribution ("Google Maps") + the out-link are mandatory on every render
 * (ToS). Kept visually separate from our own avg_rating block to avoid mixing
 * Google content with native content (ToS) and to limit review cannibalization
 * (Rohde, Kupfer & Zimmermann 2022).
 *
 * Does NOT: fetch when producerId is falsy; the caller additionally gates the
 * mount on producer.google_place_id so unmapped producers make zero requests.
 */
import { useEffect, useState } from "react";
import { Star, ArrowSquareOut } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";

export default function GoogleRatingLine({ producerId }) {
  const t = useTranslations("producer.detail.google_rating");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!producerId) return undefined;
    let active = true;
    api
      .get(`/producers/${producerId}/google-rating`)
      .then((res) => {
        // 200 = eligible; 204 (empty body) and any error → render nothing.
        if (active && res.status === 200 && res.data?.rating != null) {
          setData(res.data);
        }
      })
      .catch(() => {
        /* fail-quiet: 204 / 404 / network → the line simply doesn't appear */
      });
    return () => {
      active = false;
    };
  }, [producerId]);

  if (!data) return null;

  return (
    <div className="mt-8 border-t border-border pt-4">
      <a
        href={data.google_maps_uri}
        target="_blank"
        rel="noopener noreferrer nofollow"
        aria-label={t("link_label")}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-text"
      >
        <Star size={16} weight="fill" className="text-[#F9AB00]" aria-hidden="true" />
        <span>
          {t("summary", { rating: data.rating, count: data.user_rating_count })}
        </span>
        <ArrowSquareOut size={14} className="opacity-70" aria-hidden="true" />
      </a>
    </div>
  );
}
