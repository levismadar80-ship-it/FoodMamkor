"use client";

import { Star } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Module:   ReviewInviteCard
 * Purpose:  The invitation to write a review, for a reader who cannot open the
 *           form yet: a card with five empty stars (Google Maps' «Rate and
 *           review» row) instead of a grey line of instructions.
 * Does NOT: open the review form or decide who may write — ReviewsSection
 *           owns the gate (any contact channel, or the owner's invite link;
 *           server half in reviews.py, MEH-2204). Never shown to the owner.
 * Modes:
 *   "login"   — guest. The stars are one link to sign in; the login page
 *               returns to this page's #reviews (ReviewsSection builds it).
 *   "contact" — signed in, has not contacted the business yet. The stars
 *               scroll to the contact card, where the contact happens.
 * History:  MEH-2999 (creation) — replaced «התחברו וצרו קשר בוואטסאפ כדי
 *           לכתוב ביקורת» and «לחצו על כפתור וואטסאפ…»: WhatsApp was never
 *           required, and the bare lines did not read as an invitation.
 */

const STAR_COUNT = 5;
const STAR_SIZE = 32;

function EmptyStars() {
  return (
    <span className="inline-flex gap-2.5" dir="ltr" aria-hidden="true">
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <Star key={i} size={STAR_SIZE} weight="regular" className="text-fg-muted" />
      ))}
    </span>
  );
}

/** The contact card renders twice (inline on phones, sidebar on desktop). */
function scrollToContactCard() {
  const cards = [...document.querySelectorAll('[data-testid="contact-card"]')];
  const visible = cards.find((el) => el.offsetParent !== null) || cards[0];
  visible?.scrollIntoView({ behavior: "smooth", block: "center" });
}

const STARS_TAP =
  "inline-flex min-h-touch items-center justify-center rounded-lg px-2 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export default function ReviewInviteCard({ mode, loginHref }) {
  const t = useTranslations("reviews");
  const title = t("invite_title");
  return (
    <div
      className="mt-8 rounded-2xl border border-border bg-surface-card px-5 py-5 text-center"
      data-testid="reviews-write-hint"
      data-mode={mode}
    >
      <p className="font-body-md text-base font-bold text-text">{title}</p>
      <div className="mt-3">
        {mode === "login" ? (
          <Link
            href={loginHref}
            data-testid="reviews-login-link"
            aria-label={title}
            className={STARS_TAP}
          >
            <EmptyStars />
          </Link>
        ) : (
          <button
            type="button"
            onClick={scrollToContactCard}
            data-testid="reviews-contact-link"
            aria-label={title}
            className={STARS_TAP}
          >
            <EmptyStars />
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-fg-muted">{t("invite_hint")}</p>
    </div>
  );
}
