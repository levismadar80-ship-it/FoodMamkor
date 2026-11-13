"use client";

import { useState } from "react";
import { ShieldCheck, Star, User } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Module:   ReviewInviteCard
 * Purpose:  The invitation to write a review, for a reader who cannot open the
 *           form yet. Google Maps' «Rate and review» row: a person circle, a
 *           question naming the business, five empty stars — straight on the
 *           page background under a hairline, no box — and one trust line.
 *           The star that is tapped is KEPT (sessionStorage) and pre-selected
 *           when the form opens after sign-in / contact, as on Google.
 * Does NOT: open the review form or decide who may write — ReviewsSection
 *           owns the gate (any contact channel, or the owner's invite link;
 *           server half in reviews.py, MEH-2204) and consumes the kept star
 *           (takeDraftStars). Never shown to the owner.
 * Modes:
 *   "login"   — guest. Each star is a link to sign in; the login page
 *               returns to this page's #reviews (ReviewsSection builds it).
 *   "contact" — signed in, has not contacted the business yet. Each star
 *               scrolls to the contact card, where the contact happens.
 * History:  MEH-2999 (creation) — replaced «התחברו וצרו קשר בוואטסאפ כדי
 *           לכתוב ביקורת». 13/11/2026 (Sapir, option ד): white card → the
 *           Google row; «קניתם אצלם?» → a question with the business name (not
 *           every business sells: workshops, events); the fine print → a
 *           trust line; a tapped star is no longer thrown away.
 */

const STAR_COUNT = 5;
const STAR_SIZE = 28;
const DRAFT_KEY = (producerId) => `review_draft_stars_${producerId}`;

/** Remember the star a reader tapped before they were allowed to write. */
export function saveDraftStars(producerId, value) {
  try {
    sessionStorage.setItem(DRAFT_KEY(producerId), String(value));
  } catch {}
}

/** Read and clear the kept star; 0 when none (or storage is blocked). */
export function takeDraftStars(producerId) {
  try {
    const n = Number(sessionStorage.getItem(DRAFT_KEY(producerId)));
    if (n >= 1 && n <= STAR_COUNT) {
      sessionStorage.removeItem(DRAFT_KEY(producerId));
      return n;
    }
  } catch {}
  return 0;
}

/** The contact card renders twice (inline on phones, sidebar on desktop). */
function scrollToContactCard() {
  const cards = [...document.querySelectorAll('[data-testid="contact-card"]')];
  const visible = cards.find((el) => el.offsetParent !== null) || cards[0];
  visible?.scrollIntoView({ behavior: "smooth", block: "center" });
}

const STAR_TAP =
  "inline-flex min-h-touch min-w-[40px] items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function InviteStar({ value, lit, mode, loginHref, producerId, ariaLabel, onHover }) {
  const icon = (
    <Star
      size={STAR_SIZE}
      weight={lit ? "fill" : "regular"}
      className={lit ? "text-accent" : "text-fg-muted"}
      aria-hidden="true"
    />
  );
  const common = {
    "data-testid": `reviews-star-${value}`,
    "aria-label": ariaLabel,
    className: STAR_TAP,
    onMouseEnter: () => onHover(value),
    onFocus: () => onHover(value),
  };
  if (mode === "login") {
    return (
      <Link href={loginHref} onClick={() => saveDraftStars(producerId, value)} {...common}>
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        saveDraftStars(producerId, value);
        scrollToContactCard();
      }}
      {...common}
    >
      {icon}
    </button>
  );
}

export default function ReviewInviteCard({ mode, loginHref, producerId, producerName }) {
  const t = useTranslations("reviews");
  const [hovered, setHovered] = useState(0);
  const title = t("invite_title", { name: producerName || "" });
  return (
    <div
      className="mt-8 border-t border-border pt-5"
      data-testid="reviews-write-hint"
      data-mode={mode}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-background-alt text-fg-muted"
          aria-hidden="true"
        >
          <User size={26} />
        </span>
        <div className="min-w-0">
          <p className="font-body-md text-base font-bold text-text">{title}</p>
          <div
            className="-me-1.5 mt-0.5 inline-flex"
            dir="ltr"
            role="group"
            aria-label={title}
            data-testid="reviews-invite-stars"
            onMouseLeave={() => setHovered(0)}
            onBlur={() => setHovered(0)}
          >
            {Array.from({ length: STAR_COUNT }, (_, i) => (
              <InviteStar
                key={i}
                value={i + 1}
                lit={i < hovered}
                mode={mode}
                loginHref={loginHref}
                producerId={producerId}
                ariaLabel={t("star_aria", { value: i + 1 })}
                onHover={setHovered}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
        <ShieldCheck size={16} className="flex-none text-primary" aria-hidden="true" />
        {t("invite_hint")}
      </p>
    </div>
  );
}
