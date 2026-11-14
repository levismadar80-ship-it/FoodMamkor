import { useTranslations } from "next-intl";

import { getPrimaryContactHref, getPrimaryContactLabel, getPrimaryMethod, isPrimaryExternal } from "@/lib/contact-method";
import { withReferralParams } from "@/lib/utils";

import { trackPrimaryCtaClick } from "@/lib/contact-tracking";
import { INERT_PRESENT } from "@/lib/inert-attr";
import { getCtaVariant } from "@/components/ContactCtaVariants";
import { usePreviewMode } from "@/lib/preview-mode"; // MEH-2916

// MEH-1411: the sticky CTA mirrors the inline button's per-method icon.
// MEH-2813: icon AND colour now come from the same map the inline button reads
// (components/ContactCtaVariants.jsx). The old local fork here sent
// instagram / facebook / external_order to a white outlined button while the
// inline CTA filled them green — two looks for one button on one page.

/**
 * Mobile-only sticky bar that slides in from the bottom when the
 * inline CTA scrolls out of view. Verbatim move from
 * ProducerDetail.jsx:834-897.
 *
 * Visibility is driven by `isBarVisible` from useStickyBar — the
 * CSS transform translate-y toggles between 0 (visible) and 100%
 * (hidden). Animation timing (200ms ease-out enter / 150ms ease-in
 * exit) and z-index (598, below CookieBanner@599 and BottomNav@1000)
 * are preserved exactly.
 *
 * Beacon dedup applied to this onClick. Same handler as the ContactCard
 * CTA since MEH-2999 (trackPrimaryCtaClick, any channel).
 */
// MEH-3027: the BottomNav pill's lift shadow (BottomNav.jsx nav className),
// darker alpha because this pill is solid, not glass. rgba — no shadow token.
const PILL_SHADOW = "shadow-lg";

export default function StickyContactBar({
  producer,
  isVacation,
  isBarVisible,
}) {
  const isPreview = usePreviewMode(); // MEH-2916
  const t = useTranslations();
  const variant = getCtaVariant(getPrimaryMethod(producer));
  const CtaIcon = variant.Icon;
  // MEH-1525: mirror PrimaryContactButton — a business-website sticky CTA
  // carries referral UTM and drops `noreferrer` (keeps `noopener`). Website
  // method only; every other method's href + rel stay exactly as before.
  const isWebsite = getPrimaryMethod(producer) === "website";
  // MEH-2753: WhatsApp prefill + label from messages (contact_cta.*).
  const rawHref = getPrimaryContactHref(
    producer,
    t("contact_cta.wa_greeting", { name: producer?.name || "" }),
  );
  const href = isWebsite ? withReferralParams(rawHref) : rawHref;
  // MEH-2836: no contact detail at all → no bar. A bar with only the rating
  // and no button was what «מעדניית בן שמן» showed before the resolver.
  if (!href) return null;
  return (
    <div
      // MEH-76 chunk 3 (border token + inline lift shadow) is superseded by
      // MEH-3027 below: no strip, so no border; the shadow is on the pill.
      // MEH-1146 chunk A: md:hidden -> lg:hidden so the bar covers the whole
      // single-column range (mobile + tablet) that mounts the inline
      // ContactCard; the desktop sidebar card takes over at lg+.
      //
      // MEH-2148: flush to the viewport edge. The old offset was a hardcoded
      // twin of the full-width nav band that existed when MEH-20 wrote it; the
      // pill redesign (MEH-789) replaced that band, and MEH-2148's gate now
      // unmounts the pill on business pages entirely — so on every surface that
      // mounts this bar there is nothing below it to clear, and the offset was
      // rendering as a strip of dead page showing under the CTA. Measured at
      // 375px before the change: bar bottom 748, viewport 812, 64px of gap.
      //
      // MEH-3027: the full-width white strip is gone; the CTA is now a floating
      // pill with the BottomNav shell's geometry (14px side gutters, safe-area +
      // 16px bottom gutter, rounded-full, h-12 = the nav pill's compact height;
      // 56px read too heavy, Sapir 13/11). The strip put a 6px-radius
      // rectangle ~15pt from the screen bottom on iPhone — inside the display's
      // rounded corner — because env(safe-area-inset-bottom) is 0 without
      // viewport-fit=cover (layout.js, MEH-2427), so the corner clipped it
      // (Sapir, 13/11). A pill's ends follow the screen corner instead.
      // pointer-events-none on the shell + auto on the pill: the transparent
      // gutter band passes taps through to the page (MEH-1253's BottomNav fix).
      className="vv-pin lg:hidden fixed bottom-0 inset-x-0 z-[598] flex px-[14px] pointer-events-none"
      data-testid="sticky-contact-bar"
      style={{
        // MEH-2148: with the bar flush, its own height is the whole distance it
        // has to travel, so the plain slide clears the viewport. The previous
        // form added the offset above on top, and that extra term is now not
        // just unnecessary but wrong -- it would park the bar a bar-height BELOW
        // the fold and make the 150ms exit visibly overshoot.
        transform: isBarVisible ? "translateY(0)" : "translateY(100%)",
        transition: isBarVisible ? "transform 200ms ease-out" : "transform 150ms ease-in",
        // MEH-2148: this was always here and was always inert -- the bar sat
        // above the home indicator, so there was nothing to inset for. Flush to
        // the edge it starts doing its job: it keeps the CTA off the indicator.
        // MEH-3027: + 16px, the BottomNav gutter — the inset alone is 0 here.
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        opacity: isVacation ? 0.85 : 1,
      }}
      // MEH-1333: when parked off-screen the bar must be non-focusable, not just
      // aria-hidden — a bare aria-hidden left the sticky CTA tabbable inside a
      // hidden subtree (axe aria-hidden-focus, serious). `inert` removes the whole
      // subtree from tab order AND the a11y tree (implies aria-hidden), so the
      // rule can't fire and the CTA is truly unreachable while hidden.
      // MEH-2253: the value that means "present" differs between the React in
      // vitest (18.3.1 → "") and the React Next ships the page with (19.x →
      // true); the old `""` idiom was a silent no-op in the browser. The choice
      // lives in lib/inert-attr.js and is tested against both renderers.
      inert={!isBarVisible ? INERT_PRESENT : undefined}
      // MEH-2835: while the bar is shown, the mobile chat launcher steps aside
      // (ChatWidget watches [data-chat-hide]); hidden bar → attribute gone.
      data-chat-hide={isBarVisible ? "" : undefined}
    >
      {/* MEH-3027: the ≥3-review rating that sat beside the CTA is dropped
          from the floating pill (Sapir, 13/11) — it already shows in the page
          header, and a floating control carries the one action only. */}
      {/* Primary CTA */}
      {href && (
        <a
          // MEH-2916: in the owner's preview the CTA stays VISIBLE — she is
          // looking at how her page reads, and a missing button would
          // misrepresent it — but it does not act. No href (so no WhatsApp
          // app switch, no tel: dialler), out of the tab order, and
          // announced as disabled. The onClick below also returns early, so
          // the attribution beacon never fires for her own look at her own
          // page. Sapir's ruling, 11/11.
          {...(isPreview ? { "aria-disabled": "true", tabIndex: -1 } : { href })}
          data-testid="sticky-primary-cta"
          {...(!isPreview && isPrimaryExternal(producer)
            ? { target: "_blank", rel: isWebsite ? "noopener" : "noopener noreferrer" }
            : {})}
          // MEH-1426 → MEH-2999: matches the ContactCard CTA. Every primary
          // click (any channel) is recorded and unlocks the review form.
          onClick={(e) => {
            if (isPreview) {
              e.preventDefault(); // MEH-2916
              return;
            }
            // MEH-2999: any primary channel — same handler as ContactCard.
            trackPrimaryCtaClick(producer.id, getPrimaryMethod(producer));
          }}
          // MEH-3027: the lift shadow only while shown. Parked at translateY(100%)
          // the pill's top sits on the viewport edge and a 30px blur would leave
          // a green haze along the bottom of a page with the bar "hidden".
          // MEH-76 chunk 1: the vacation pale-green CTA fork was an ADR-019
          // violation (state-color fill + raw hex). The CTA keeps its normal
          // method-driven color — the whole bar is already dimmed via opacity.
          className={`pointer-events-auto w-full h-12 flex items-center justify-center gap-2 rounded-full font-medium text-sm transition ${isBarVisible ? PILL_SHADOW : ""} focus-visible:ring-2 ${variant.className}`}
        >
          <CtaIcon size={20} />
          {isVacation ? t("producer.detail.sticky_bar.vacation_msg") : getPrimaryContactLabel(producer, t)}
        </a>
      )}
    </div>
  );
}
