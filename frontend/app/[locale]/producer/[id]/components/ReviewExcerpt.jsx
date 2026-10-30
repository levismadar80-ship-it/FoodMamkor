"use client";

import { useEffect, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import api from "@/lib/api";

/**
 * MEH-1048 (chunk 2) — one short review quote above the fold, linked to the
 * reviews section (#reviews).
 *
 * Data: reviews are lazy-fetched on scroll elsewhere; this eager-fetches page
 * 1 of the nested reviews endpoint (≤10, newest-first) ONLY when the producer
 * has reviews — a zero-review producer makes no call at all. It shows the
 * most-recent review WITH non-empty body, falling through rating-only
 * reviews; if none in page 1 have text, it renders nothing (the header rating
 * pill still shows). No sorting, no schema change (over-engineering guard).
 *
 * Does NOT: fetch/paginate the full reviews section — that stays in
 * ReviewsSection (IO-lazy). Related: ProducerHeader.jsx (mount point),
 * backend reviews.py:149 (endpoint, PAGE_SIZE=10).
 */
const MAX_LEN = 120;

export default function ReviewExcerpt({ producerId, reviewsCount = 0 }) {
  const t = useTranslations();
  const [excerpt, setExcerpt] = useState(null);

  useEffect(() => {
    // Guard: zero reviews → no fetch at all (Sapir condition a).
    if (!producerId || reviewsCount <= 0) return undefined;
    let alive = true;
    // MEH-1048 a11y-followup: abort the in-flight request on unmount /
    // param change so it doesn't run to completion after the component is gone.
    const controller = new AbortController();
    api
      .get(`/producers/${producerId}/reviews`, { params: { page: 1 }, signal: controller.signal })
      .then((r) => {
        if (!alive) return;
        const reviews = r.data?.reviews ?? [];
        // Newest-first order → first with non-empty body is the most-recent
        // review that has text; rating-only reviews are skipped.
        const withText = reviews.find((rv) => rv.body && rv.body.trim());
        if (!withText) return;
        const body = withText.body.trim();
        setExcerpt(body.length > MAX_LEN ? `${body.slice(0, MAX_LEN).trimEnd()}…` : body);
      })
      .catch((err) => {
        // Swallow ONLY genuine aborts (axios CanceledError on unmount / param
        // change). Checking the error — not signal.aborted — avoids dropping a
        // real error whose .catch races cleanup, preserving MEH-325 observability.
        // Fail-open: no excerpt on error (the header rating pill still shows).
        if (err?.code === "ERR_CANCELED") return;
        Sentry.captureException(err);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [producerId, reviewsCount]);

  if (!excerpt) return null;

  // MEH-1334: the editorial pull-quote, quiet source footer.
  // MEH-2596: a gold rule at the inline-start replaces the hairline frame and
  // the small quote mark, and the text is upright — Hebrew has no italic, so
  // `italic` only made the browser slant the letters. Display face, 20px.
  // The #reviews anchor, self-hiding guards, and testids are unchanged.
  return (
    <a
      href="#reviews"
      className="mt-6 block border-s-[3px] border-accent ps-4 py-1 rounded-none transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
      data-testid="review-excerpt"
    >
      <span className="block font-headline-md text-[20px] leading-normal text-text">
        {/* The quote text IS the link's accessible name so AT users hear the
            actual review; the nav purpose is an sr-only suffix instead of an
            aria-label (which would override — and hide — the quote). */}
        <span className="line-clamp-2" data-testid="review-excerpt-text">{excerpt}</span>
      </span>
      <span className="mt-2 flex items-center gap-1 text-xs text-fg-muted">
        {t("producer.detail.header.excerpt_footer")}
        <span aria-hidden="true">·</span>
        {t("producer.detail.header.excerpt_all")}
        {/* Forward chevron points LEFT in RTL (revision-1 #11) */}
        <CaretLeft size={12} aria-hidden="true" />
      </span>
      <span className="sr-only">{t("producer.detail.header.review_excerpt_aria")}</span>
    </a>
  );
}
