"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { WhatsappLogo, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { formatPriceRange, getWhatsAppHref, normalizePhone } from "@/lib/utils";
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

export default function ProductSheet({ product, producer, onClose }) {
  const t = useTranslations();
  // MEH-1524: the source line is defined once, under whatsapp.question_chips,
  // and every prefill that opens a chat with a specific business ends with it
  // on its own final line. Read from there rather than restating the string.
  const tChips = useTranslations("whatsapp.question_chips");
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

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
  // No phone → no CTA node at all, never a dead link.
  const digits = normalizePhone(producer?.phone);
  const waHref = digits
    ? getWhatsAppHref(
        digits,
        `${t("producer.detail.sections.products.sheet_wa_prefill", {
          name: product.name || "",
        })}\n\n${tChips("source_line")}`,
      )
    : null;

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
          <div className="relative aspect-square w-full overflow-hidden rounded-t-2xl bg-background">
            {img ? (
              <Image
                src={img}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 448px"
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
                  className="font-headline-md text-6xl text-primary/40"
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

        {waHref && (
          <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="product-sheet-wa-cta"
              // MEH-1426 invariant, unchanged and extended to this surface:
              // every WhatsApp click both attributes (pingWhatsAppBeacon) and
              // unlocks the review form (markWhatsAppClickedLocal). Fired at
              // the call site exactly as ContactCard.jsx:228-239 and
              // StickyContactBar.jsx:123-128 do — there is no shared CTA
              // component wrapping the two, so this reuses the helpers rather
              // than forking or editing them.
              onClick={() => {
                pingWhatsAppBeacon(producer?.id);
                markWhatsAppClickedLocal(producer?.id);
              }}
              className="btn-whatsapp flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 py-3 font-medium transition focus-visible:ring-2"
            >
              <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
              {t("producer.detail.sections.products.sheet_cta")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
