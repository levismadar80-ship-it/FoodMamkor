"use client";

import { useEffect, useState } from "react";
import { Quotes } from "@phosphor-icons/react";
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
        // Swallow aborts (unmount / param change) — only report real failures.
        // Fail-open: no excerpt on error (the header rating pill still shows).
        // Sentry keeps the non-critical path observable (not a silent-except,
        // MEH-325) without surfacing a 5xx to the user.
        if (controller.signal.aborted) return;
        Sentry.captureException(err);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [producerId, reviewsCount]);

  if (!excerpt) return null;

  return (
    <a
      href="#reviews"
      className="mt-2 flex items-start gap-1.5 rounded text-sm italic text-fg-muted transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
      data-testid="review-excerpt"
    >
      <Quotes size={15} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      {/* The quote text IS the link's accessible name so AT users hear the
          actual review; the nav purpose is an sr-only suffix instead of an
          aria-label (which would override — and hide — the quote). */}
      <span className="line-clamp-2" data-testid="review-excerpt-text">{excerpt}</span>
      <span className="sr-only">{t("producer.detail.header.review_excerpt_aria")}</span>
    </a>
  );
}
