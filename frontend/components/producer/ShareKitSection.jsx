"use client";

import { useTranslations } from "next-intl";
import ReviewCardCanvas from "@/components/ReviewCardCanvas";
import StoryCardCanvas from "@/components/StoryCardCanvas";

/**
 * Module:   ShareKitSection
 * Purpose:  MEH-1428 "ערכת שיתוף" — the owner's own share kit. One section,
 *           two ready-to-post 1080×1920 cards: her story card
 *           (StoryCardCanvas in `owner` mode — download + caption, no
 *           Cloudinary upload) and a review card (ReviewCardCanvas).
 * Data:     `profile` (GET /producers/me → ProducerOwnerOut), NOT the
 *           dashboard payload (GET /producers/me/dashboard), which returns
 *           only id/name/status/plan/availability — no `images`,
 *           `categories` or `slug`. The cards need all three.
 * Gate:     the caller renders it for an approved business only (the story
 *           card announces a live listing; the review endpoint has nothing to
 *           serve a business with no public page) and never for an organizer
 *           (ADR-036 — reviews.py filters kind == "producer").
 * History:  MEH-1428 (creation, inside dashboard/page.js); MEH-2880 / MEH-2882
 *           (moved out of the dashboard home into «כלים» → «שיתוף»: a
 *           one-time / occasional job, placement audit 2026-11).
 */
export default function ShareKitSection({ profile }) {
  const t = useTranslations("story.canvas.owner");

  return (
    <section
      data-testid="share-kit-section"
      aria-label={t("section_title")}
      className="bg-surface border border-border rounded-lg p-5 mb-6"
    >
      <h2 className="font-headline-md text-lg font-bold text-text mb-1">
        {t("section_title")}
      </h2>
      <p className="text-sm text-fg-muted">{t("section_subtitle")}</p>

      <StoryCardCanvas producer={profile} mode="owner" />
      <ReviewCardCanvas producer={profile} />
    </section>
  );
}
