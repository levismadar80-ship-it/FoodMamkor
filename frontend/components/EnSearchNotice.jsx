"use client";

import { useLocale, useTranslations } from "next-intl";
import LanguageToggle from "@/components/LanguageToggle";

/**
 * Module:   EnSearchNotice
 * Purpose:  Tells an /en visitor, BEFORE they type, that business listings are
 *           Hebrew-only and English queries return nothing — and gives them a
 *           one-click way back to /he on the same page.
 * Does NOT: change search behaviour. The backend has no locale parameter
 *           (`search.py` filters Hebrew columns with `ilike`), and this ticket
 *           deliberately does not add transliteration — see MEH-1812 §2ג for why
 *           (zero of 12 business names, zero of 11 cities and zero of 18
 *           categories carry a Latin character, and no engine is installed).
 *           This component states the gap; it does not close it.
 * Related:  components/LanguageToggle.jsx (the CTA's mechanism),
 *           components/HeroSearch.jsx + app/[locale]/search/SearchClient.jsx
 *           (the two consumer surfaces that mount it).
 * History:  MEH-1812 (creation; copy locked by Sapir 02/08, recorded in
 *           docs/COPY_BANK.md Section 13 before this component existed).
 */
export default function EnSearchNotice({ className = "" }) {
  // Hooks first, unconditionally — the locale gate below is a render decision,
  // not a hook decision.
  const locale = useLocale();
  const t = useTranslations("search.en_notice");

  // The gate. Returning null here is what keeps `t()` from ever running on /he,
  // which matters: these two keys live in en.json ONLY. That is deliberate and
  // it is safe in both directions —
  //   · the ticket forbids touching he.json (zero Hebrew-copy change), and
  //   · en-parity-guard.test.js asserts the OPPOSITE direction (a he.json key
  //     missing from en.json), so an en-only key does not trip it. Verified
  //     against the guard rather than assumed.
  // Because JSX below is only evaluated after this return, `t()` is never
  // called in a locale where its namespace is absent.
  if (locale !== "en") return null;

  return (
    <div
      data-testid="en-search-notice"
      role="note"
      // dir="ltr" is required, not cosmetic. The document root is dir="rtl"
      // (globals.css `html { direction: rtl }`), so an English sentence inside
      // it has its trailing punctuation reordered by the bidi algorithm — the
      // self-QA capture at 375 showed this string wrapping as
      // «.returns no results», with the full stop moved to the head of the line.
      // This component renders English copy ONLY (it returns null on every other
      // locale, a few lines up), so scoping direction to it is unconditionally
      // correct and cannot affect Hebrew anywhere.
      // NOTE: the same bidi flaw is visible on OTHER /en strings in that capture
      // (the hero subtitle renders «.we've already vetted for you», the chips
      // prefix «:Popular now»). Those are pre-existing and site-wide, NOT fixed
      // here — out of this ticket's scope, and worth their own card.
      dir="ltr"
      // NO text colour here on purpose — the caller owns it. The two mount
      // points sit on opposite backgrounds: the hero pill rides the photo scrim
      // (where HomeHero.jsx:285 records that `text-fg-muted` fails AA, so the
      // on-scrim tone is `text-green-50`), while /search is on cream. Baking a
      // default in and letting callers "override" it would put two Tailwind
      // colour classes in one attribute, where the winner is decided by
      // stylesheet order rather than by the caller — a coin flip, not an override.
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[13px] ${className}`}
    >
      <span>{t("body")}</span>
      {/* The CTA REUSES LanguageToggle rather than calling router.replace
          itself, and that is load-bearing rather than tidiness. LanguageToggle
          also writes `localStorage.lang` (LanguageToggle.jsx:57-66, MEH-475):
          without it the pre-Wave-1 shim in lib/language-context.js reads the
          stale saved locale on the next mount and flips the visitor straight
          back to /en. A hand-rolled switch would look correct in review and
          bounce the user on their very next navigation.
          It also preserves query + hash, so a deep /en path returns to its /he
          twin rather than the homepage — which is the acceptance criterion. */}
      <LanguageToggle
        variant="bare"
        className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:text-primary-dark"
      >
        {t("cta")}
      </LanguageToggle>
    </div>
  );
}
