"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  WhatsappLogo,
  Phone,
  Globe,
  EnvelopeSimple,
  InstagramLogo,
  FacebookLogo,
  Receipt,
  X,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import {
  formatPriceRange,
  getWhatsAppHref,
  normalizePhone,
  withReferralParams,
} from "@/lib/utils";
import {
  getPrimaryContactHref,
  getPrimaryContactLabel,
  getPrimaryMethod,
  isPrimaryExternal,
} from "@/lib/contact-method";
import { markWhatsAppClickedLocal, pingWhatsAppBeacon } from "@/lib/contact-tracking";

/**
 * Module:   ProductSheet
 * Purpose:  MEH-1901 — the full detail of ONE product, as an overlay opened
 *           from the producer page's product grid row or signature card.
 *           `description` accepts 2000 chars but every public surface clamps
 *           it to one or two lines, so until now the full text was reachable
 *           from nowhere; the per-product diet flags (ProductOut.is_vegan &
 *           friends, MEH-293/1438) were collected and never rendered publicly
 *           at all. This is the surface that shows both.
 *           MEH-1916 replaced the hardcoded WhatsApp CTA with the producer's
 *           chosen primary_contact_method (lib/contact-method.js), so the sheet
 *           routes where she asked to be reached — and a producer with no phone
 *           no longer gets a sheet that ends in nothing.
 * Does NOT: own a route ("מגזין, לא marketplace" — overlay only, no
 *           /product/[id]), fetch anything (the product object arrives from
 *           the already-loaded producer payload), or render a gallery /
 *           swipe physics. No analytics beyond the WhatsApp beacon that every
 *           other WA CTA already fires.
 * Related:  frontend/components/Lightbox.jsx:26-64 (body scroll-lock + Escape
 *           + Tab trap + focus-to-close — the modal contract copied here),
 *           frontend/components/AccountSheet.jsx:43-70 (focus RETURN to the
 *           trigger via prevActive, which Lightbox omits),
 *           frontend/components/ProductsSection.jsx:662-673 (DeleteConfirmDialog
 *           — role="dialog" + aria-modal + bg-black/40 backdrop),
 *           frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx
 *           (the only caller; owns which product is open).
 *
 * Deliberately NOT built on `ui/Popover`: that primitive anchors to a trigger
 * and re-clamps on scroll (MEH-1893 / MEH-2553). A product sheet is a modal —
 * `position: fixed` + backdrop + scroll-lock — so it is structurally immune to
 * the popover-travel class rather than depending on the clamp being right.
 *
 * z-[1060]: above the sticky mobile CTA bar (StickyContactBar z-[598]), the
 * BottomNav pill (z-[1000]) and the global header (z-[1050]); below the cookie
 * banner (z-[1100]) and the chat FAB (9999). Per the token ledger in
 * .claude/rules/rtl.md.
 */

// ProductOut field → i18n key under producer.detail.sections.products.diet.
// Only flags that are strictly `true` render, so a product with every flag
// false shows NO chip row at all (not an empty one).
const DIET_FLAGS = [
  { field: "is_gluten_free", key: "gluten_free" },
  { field: "is_vegan", key: "vegan" },
  { field: "is_vegetarian", key: "vegetarian" },
  { field: "is_lactose_free", key: "lactose_free" },
];

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// MEH-1916: the sheet's CTA follows the channel the producer actually chose
// (primary_contact_method) instead of hardcoding WhatsApp. Icon + surface class
// per method, mirroring the inline primary button so the two read as one system.
// REUSES: components/PrimaryContactButton.jsx VARIANTS (icon + className), the
// same way StickyContactBar.jsx:24-32 mirrors it — there is no shared CTA
// component and MEH-1901 recorded that duplication as deliberate.
const METHOD_CTA = {
  whatsapp: { Icon: WhatsappLogo, className: "btn-whatsapp" },
  phone: {
    Icon: Phone,
    className: "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40",
  },
  website: {
    Icon: Globe,
    className:
      "bg-white text-text border border-primary hover:bg-green-50 focus-visible:ring-primary/40",
  },
  email: {
    Icon: EnvelopeSimple,
    className:
      "bg-primary-dark text-white hover:bg-primary focus-visible:ring-primary-dark/40",
  },
  instagram: {
    Icon: InstagramLogo,
    className: "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40",
  },
  facebook: {
    Icon: FacebookLogo,
    className: "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40",
  },
  external_order: {
    Icon: Receipt,
    className: "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40",
  },
};

export default function ProductSheet({ product, producer, onClose }) {
  const t = useTranslations();
  // MEH-1524: the source line is defined once, under whatsapp.question_chips,
  // and every prefill that opens a chat with a specific business ends with it
  // on its own final line. Read from there rather than restating the string.
  const tChips = useTranslations("whatsapp.question_chips");
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  // MEH-1976: the src whose load failed (Cloudinary 401, MEH-1925). Must sit
  // above the `if (!product) return null` below — hooks cannot be conditional.
  const [failedSrc, setFailedSrc] = useState(null);

  useEffect(() => {
    // Focus moves to the close button on open and RETURNS to whatever opened
    // the sheet on close (the grid row / signature card button).
    const prevActive = document.activeElement;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const els = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? []);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prevActive instanceof HTMLElement) prevActive.focus();
    };
  }, [onClose]);

  if (!product) return null;

  const img = product.image_url
    ? optimizeCloudinary(product.image_url, {
        aspectRatio: IMAGE_RATIOS.square,
        width: 640,
      })
    : null;
  // MEH-1976: derived during render, NOT via an effect — the state holds the
  // src that failed, so a new `img` makes this false with no reset needed.
  // (The hook itself lives above the `if (!product)` early return; declaring
  // it here would call it conditionally — react-hooks/rules-of-hooks.)
  const imgError = failedSrc !== null && failedSrc === img;

  const dietKeys = DIET_FLAGS.filter((f) => product[f.field] === true).map((f) => f.key);

  // MEH-1305 F, verbatim: a numeric price goes through the canonical
  // formatPriceRange (MEH-1140) and is bidi-isolated with dir="ltr"; a
  // free-text price_range is DATA (MEH-1140 — never reformatted) and renders
  // in the natural direction, since forcing dir="ltr" corrupts a
  // Hebrew-bearing label like "מ-30₪" / "30₪ לחבילה".
  const numericPrice =
    product.price_min != null
      ? formatPriceRange(product.price_min, product.price_max)
      : null;
  const freeTextPrice = numericPrice ? null : product.price_range || null;

  // The WhatsApp channel is the producer's phone, normalised exactly as every
  // other WA surface does it (lib/utils normalizePhone → getWhatsAppHref).
  // This href keeps the PRODUCT-name prefill — deliberately not
  // getPrimaryContactHref's generic business prefill (contact-method.js:46),
  // which knows nothing about which product is open.
  const digits = normalizePhone(producer?.phone);
  const waHref = digits
    ? getWhatsAppHref(
        digits,
        `${t("producer.detail.sections.products.sheet_wa_prefill", {
          name: product.name || "",
        })}\n\n${tChips("source_line")}`,
      )
    : null;

  // MEH-1916. The primary CTA is the producer's chosen channel; WhatsApp is the
  // fallback, not the default. Two separate misses used to collapse into the
  // same "no CTA" state:
  //   - a producer whose channel is website/phone/email got a WhatsApp button
  //     in spite of her choice;
  //   - a producer with no phone got a sheet with no action at all.
  const method = getPrimaryMethod(producer);
  const methodHref = method === "whatsapp" ? waHref : getPrimaryContactHref(producer);
  // The chosen channel's own field is empty (backend validation should prevent
  // this — defense in depth, same posture as contact-method.js:31-33). Rather
  // than end the sheet on a dead end, fall back to WhatsApp AS THE PRIMARY when
  // a phone exists. The secondary link is suppressed in that case: it would be
  // the identical href rendered twice.
  const waIsPrimary = Boolean(!methodHref && waHref) || method === "whatsapp";
  const primaryHref = methodHref || waHref;
  const primaryMethod = waIsPrimary ? "whatsapp" : method;
  const variant = METHOD_CTA[primaryMethod] || METHOD_CTA.whatsapp;
  const PrimaryIcon = variant.Icon;
  // MEH-1525, mirroring PrimaryContactButton.jsx:78-79 and
  // StickyContactBar.jsx:58-63: a business-website CTA carries referral UTM and
  // drops `noreferrer` (keeps `noopener`) so the owner's analytics can attribute
  // the visit. Website only — social / external_order hrefs and rel untouched.
  const isWebsite = primaryMethod === "website";
  const primaryFinalHref = isWebsite ? withReferralParams(primaryHref) : primaryHref;
  const primaryExternal = !waIsPrimary && isPrimaryExternal(producer);
  // Quiet escape hatch: when the producer routes elsewhere but still has a
  // phone, WhatsApp stays reachable as a TEXT link — one loud CTA per sheet, so
  // the chosen channel is not visually contested (MEH-1901 layout invariant).
  const showSecondaryWa = !waIsPrimary && Boolean(waHref);

  const fireWaTracking = () => {
    pingWhatsAppBeacon(producer?.id);
    markWhatsAppClickedLocal(producer?.id);
  };

  return (
    <div
      className="fixed inset-0 z-[1060] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
      role="presentation"
      data-testid="product-sheet-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        data-testid="product-sheet"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl md:max-w-md md:rounded-2xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("producer.detail.sections.products.sheet_close_aria")}
          data-testid="product-sheet-close"
          className="absolute top-3 end-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-text transition hover:bg-background focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>

        {/* Scroll body. The description is the reason this sheet exists, so it
            is the thing allowed to grow — the CTA lives in the footer below,
            outside the scroller, and stays reachable however long the text. */}
        <div
          className="flex-1 overflow-y-auto"
          data-testid="product-sheet-scroll"
        >
          {/* A real photo earns the full square. The no-photo state does NOT:
              at 80px in the grid a typographic square reads as a thumbnail, but
              at sheet width it becomes a near-empty 375px block that pushes the
              description — the whole reason this sheet exists — and the price
              below the fold. Measured at 375 and 1440 before this fork existed
              (qa-artifacts/MEH-1901/*-noimage-before.png): the placeholder took
              ~60% of the panel. It collapses to a short band instead. */}
          <div
            className={`relative w-full overflow-hidden rounded-t-2xl bg-background ${
              img && !imgError ? "aspect-square" : "h-28"
            }`}
          >
            {img && !imgError ? (
              <Image
                src={img}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 448px"
                onError={() => setFailedSrc(img)}
              />
            ) : (
              // MEH-1305 E: the same typographic no-photo cell the grid uses —
              // the product's initial in Frank Ruhl on a bg-primary/[0.06]
              // tint, NO leaf glyph and no package icon.
              <div
                className="flex h-full w-full items-center justify-center bg-primary/[0.06]"
                aria-label={t("producer.card.aria.image_missing", { name: product.name })}
                role="img"
              >
                <span
                  className="font-headline-md text-4xl text-primary/40"
                  aria-hidden="true"
                >
                  {product.name?.trim()?.[0] || "•"}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4">
            <h2 className="font-headline-md text-xl font-bold text-text">
              {product.name}
            </h2>

            {/* Quiet text pills. Per-PRODUCT flags, so no "100%" language and no
                whole-business claim — MEH-1508 owns the producer-level facility
                story, and .claude/rules/labels.md keeps the two scopes apart. */}
            {dietKeys.length > 0 && (
              <ul
                className="flex flex-wrap gap-1.5"
                data-testid="product-sheet-diet"
              >
                {dietKeys.map((key) => (
                  <li
                    key={key}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted"
                  >
                    {t(`producer.detail.sections.products.diet.${key}`)}
                  </li>
                ))}
              </ul>
            )}

            {product.description && (
              <p
                className="whitespace-pre-line text-sm leading-relaxed text-text"
                data-testid="product-sheet-description"
              >
                {product.description}
              </p>
            )}

            {numericPrice && (
              <p className="font-medium text-accent" data-testid="product-sheet-price">
                <span dir="ltr">{numericPrice}</span>
              </p>
            )}
            {freeTextPrice && (
              <p className="font-medium text-accent" data-testid="product-sheet-price">
                {freeTextPrice}
              </p>
            )}
          </div>
        </div>

        {/* No footer at all only when BOTH the chosen channel's field and the
            phone are missing — the one state with genuinely nothing to offer. */}
        {primaryHref && (
          <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <a
              href={primaryFinalHref}
              {...(waIsPrimary || primaryExternal
                ? {
                    target: "_blank",
                    rel: isWebsite ? "noopener" : "noopener noreferrer",
                  }
                : {})}
              // The WhatsApp testid is load-bearing outside this ticket's scope
              // (frontend/e2e/qa-meh1901-sheet.mjs:87 queries it), so a WA
              // primary keeps it byte-for-byte; other channels get the neutral
              // id. `data-method` is the stable discriminator either way.
              data-testid={waIsPrimary ? "product-sheet-wa-cta" : "product-sheet-cta"}
              data-method={primaryMethod}
              // MEH-1426 invariant, unchanged: every WhatsApp click both
              // attributes (pingWhatsAppBeacon) and unlocks the review form
              // (markWhatsAppClickedLocal) — and a non-WhatsApp primary fires
              // NEITHER, exactly as StickyContactBar.jsx:123-128 gates it.
              // Fired at the call site as ContactCard.jsx:228-239 does; there is
              // no shared CTA component, so this reuses the helpers rather than
              // forking or editing them.
              {...(waIsPrimary ? { onClick: fireWaTracking } : {})}
              className={`${variant.className} flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 py-3 font-medium transition focus-visible:ring-2`}
            >
              <PrimaryIcon size={20} weight="fill" aria-hidden="true" />
              {waIsPrimary
                ? t("producer.detail.sections.products.sheet_cta")
                : getPrimaryContactLabel(producer)}
            </a>

            {showSecondaryWa && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="product-sheet-wa-secondary"
                onClick={fireWaTracking}
                className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 text-sm text-fg-muted underline underline-offset-4 transition hover:text-text focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <WhatsappLogo size={16} weight="fill" aria-hidden="true" />
                {t("producer.detail.sections.products.sheet_secondary_wa")}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
