import RescueSection from "@/components/rescue/RescueSection";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CaretLeft, Clock, Info, MapPin } from "@phosphor-icons/react";
import Seed from "@/components/brand/Seed";
import { seedColorFor } from "@/lib/brand-seeds";
import dynamic from "next/dynamic";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
// MEH-1140: canonical shekel format — amount then ₪ ("35₪"), one owner in lib/utils.
import { formatPriceRange, isPriceLabel } from "@/lib/utils";
import { badgeIcon } from "@/lib/chip-icons";
import { formatEventDate } from "@/lib/format-date";
import DeliveryBlock from "@/components/DeliveryBlock";
// MEH-788: scroll-reveal on the description + similar sections (not LCP/gallery).
import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";
import { resolveStoreHours } from "@/lib/hours";
import { primaryPoint } from "@/lib/producerPoints";
// MEH-1306: owner-only per-section pencil → deep-links into the edit
// accordion. Self-gating (0 DOM for non-owners), mounted unconditionally.
import OwnerSectionEditLink from "@/components/OwnerSectionEditLink";
// MEH-1334 chunk 3: "מאחורי העסק" — data-gated owner card (Z4).
import OwnerCard from "./OwnerCard";
import ReservistBadgeLine from "./ReservistBadgeLine";
import ProducerActivities from "./ProducerActivities";
// MEH-1875: the weekly order-window schedule as a headed Info block. Lives in
// OrderWindowStrip.jsx beside OrderWindowCtaNote (ContactCard's consumer).
import { ProducerHoursSection } from "./OrderWindowStrip";
import RecipeCard from "@/components/public/RecipeCard";
// MEH-1901: the full product detail (long description, per-product diet flags)
// as an overlay — no route, no marketplace.
import ProductSheet, { productDietKeys } from "@/components/public/ProductSheet";
import ProductGroupChips, { UNGROUPED } from "@/components/public/ProductGroupChips";
import { chipGroups, hasUngrouped, orderProducts } from "@/lib/product-order";
import ReportButton from "@/components/ReportButton";
// MEH-1460: the "טעות בפרטים?" correction link relocated here from
// ContactCard — its modal/email logic (v1, MEH-1443) is unchanged.
import ReportInfoModal from "@/components/ReportInfoModal";
import ReviewsSection from "@/components/ReviewsSection";
// MEH-1490: quiet live-fetch Google-rating line — renders below (and detached
// from) the native reviews block, only for producers an admin mapped.
import GoogleRatingLine from "@/components/GoogleRatingLine";
import SectionHeading from "@/components/ui/SectionHeading";
import ShowMore from "@/components/ui/ShowMore";
import FactLine from "@/components/ui/FactLine";

// MEH-1853: `loading:` placeholder REVERTED 06/08 — it measurably made CLS
// WORSE, and the measurement is on the ticket. Reserving a 356px box that
// matches the component to the pixel (proven: delta=0px at 390 and 1280)
// did NOT remove the shift on the real page:
//
//     desktop-1440   0.8744  ->  1.0929   (+25%)
//     mobile-375     1.3735  ->  1.3735   (unchanged)
//
// Both measured against staging with a verified-fresh deployment and an
// observer-verified sampler (runs 31005749506 and 31105035597).
//
// DO NOT re-add a `loading:` here without re-measuring. The geometry argument
// is not sufficient and has now been falsified once: `ssr: false` means the
// placeholder is NOT in the server HTML and mounts at hydration, so it may add
// a shift rather than replace one. That is a hypothesis, not a finding —
// entries stayed at 4 on desktop before and after, which does not obviously
// fit it. See MEH-1853.
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

// MEH-1334 chunk 3: single owner of "does this producer have a mappable
// location" — gates both the merged location section and the MiniMap mount.
// MEH-1938 chunk 5a: answered from the PRIMARY producer_locations row via
// primaryPoint(), not from Producer.lat/lng — those columns are read by no
// consumer surface any more and are dropped in chunk 5b. The
// has_physical_location gate is unchanged: a delivery-only business keeps its
// pickup pins on /map, not a "location" section here.
// `pin` is primaryPoint(producer), computed ONCE per render by the component
// and passed in, so the gate and the MiniMap props read the same value — the
// null-safety of `pin.lat` below is then a fact of one variable, not a
// coincidence between two calls (CI reviewer, 02/09).
// Exported for the section anchor-nav's gate (lib/section-nav.js) — one
// definition, so the location pill and the location section cannot disagree.
export function parseHasLocation(producer, pin) {
  return producer.has_physical_location !== false && pin !== null;
}

// MEH-1901: the signature card's outer element. A <button> when the free-text
// top_product_name matched a real product row (so there is a sheet to open),
// an inert <div> otherwise. Same classes either way — the card looks identical;
// only its interactivity is conditional, which is the honest rendering of
// "signatureProduct may be null" (see the MEH-1233 B4 note on the derivation).
// MEH-2592 C: a medium feature card — a 112px photo (144px on md+), a soft gold
// border, rounder corners. Sapir rejected a full-width photo as too big (30/10).
// MEH-3021: how many product rows a long list shows before «הצגת כל N
// המוצרים» — 6 on the phone, 8 from md (two columns × 4). The signature
// product is outside the count and always shows.
const PRODUCTS_PREVIEW_MOBILE = 6;
const PRODUCTS_PREVIEW_DESKTOP = 8;

const SIGNATURE_SHELL_CLASS =
  "mb-5 flex items-center gap-4 bg-surface-card border border-accent/40 rounded-2xl p-3.5 shadow-sm";

function SignatureShell({ product, onOpen, ariaLabel, children }) {
  if (!product) {
    return <div className={SIGNATURE_SHELL_CLASS}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      aria-label={ariaLabel}
      data-testid="signature-product-trigger"
      className={`${SIGNATURE_SHELL_CLASS} w-full text-start transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40`}
    >
      {children}
    </button>
  );
}

// PR #3974 (Sapir 31/10): the listing card shows «צמחוני +4», and the page
// never said WHICH products carry them. Each product names its own flags —
// icon + the same label as the sheet (MEH-2584 icon+word). Renders nothing for
// a product with no flags (or no product at all, e.g. a free-text signature).
function ProductDietPills({ product, t }) {
  const keys = productDietKeys(product);
  if (keys.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1 mt-1.5" data-testid="product-row-diet">
      {keys.map((key) => (
        <li
          key={key}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted"
        >
          <span aria-hidden="true" className="inline-flex">{badgeIcon(key, 12)}</span>
          {t(`producer.detail.sections.products.diet.${key}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The middle of the main column. MEH-2592 reorders the sections so everything
 * about this business comes first: about → owner → products → recipes →
 * events + experiences → group buys (ProducerActivities) → reviews →
 * delivery → «שעות» (MEH-2803) → location (city + MiniMap) → fine print (disclaimer, report, last-updated). The similar /
 * nearby rows moved out to <OtherBusinesses>, which ProducerDetail renders
 * full width below both columns. The signature product (top_product_name / price_range)
 * moved OUT of ProducerHeader to the top of the products section here.
 *
 * Delivery (MEH-1168 P3, decision A): a single editorial <DeliveryBlock> serves
 * ALL producers — fed delivery_areas (city · min order · day) + pickup_points +
 * a demoted tertiary CTA. It renders whenever the producer has any delivery or
 * pickup signal. The legacy delivery_areas table was retired from this page.
 *
 * The events list (and its show-all state) moved to ProducerActivities
 * (MEH #2659), merged with experiences. The reviews wrapper accepts
 * reviewsContainerRef and reviewsVisible from useLazyReviews so the IO
 * observation point remains identical to the source.
 */
export default function ProducerSections({
  producer,
  events,
  sectionRefs,
  reviewsContainerRef,
  reviewsVisible,
  isOwner = false,
  onReviewsTotalChange,
}) {
  const t = useTranslations();
  const locale = useLocale();
  // MEH-1938 chunk 5a: the one point that stands for "where the business is"
  // (the is_primary row or null) — gates the location section and centres the
  // MiniMap. Computed once so both read the same answer.
  const primaryPin = primaryPoint(producer);
  // MEH-2142: which store-hours string this page shows — the primary
  // location's, falling back to the legacy business-level column. Resolved
  // ONCE, here, because the location section both gates on it and renders it,
  // and two call sites would be two chances to disagree.
  const storeHours = resolveStoreHours(producer);
  const hasLocation = parseHasLocation(producer, primaryPin);
  // MEH-1460: "report wrong info" modal — moved from ContactCard so the
  // correction link lives in the page-end meta block, not the CTA card.
  const [reportOpen, setReportOpen] = useState(false);
  // MEH-1901: whether a product's detail sheet is open. The sheet is an
  // overlay, not a route — one piece of state, no URL surface.
  // MEH-2045: that state is now the POSITION in the rendered product list, not
  // the product object. prev/next is meaningless without knowing where you
  // are, and keeping the position here (rather than a second copy inside the
  // sheet) leaves ProductSheet fully prop-derived. null = closed.
  const [openIndex, setOpenIndex] = useState(null);
  // MEH-3021: whether a long product list is expanded past its first rows.
  const [showAllProducts, setShowAllProducts] = useState(false);
  // MEH-3055: the visitor's group filter — null = «הכל».
  const [activeGroup, setActiveGroup] = useState(null);
  // MEH-591: producer recipes (chunk 4/4). Fetched client-side via the
  // public read endpoint added in chunk 2 — backend already filters to
  // published+approved, so an empty array means "no recipes to show"
  // and the section hides entirely (silent empty, per spec).
  const [recipes, setRecipes] = useState([]);
  useEffect(() => {
    if (!producer?.slug) return;
    let cancelled = false;
    api
      .get(`/producers/${encodeURIComponent(producer.slug)}/recipes`)
      .then((r) => {
        if (!cancelled) setRecipes(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setRecipes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [producer?.slug]);

  // MEH-1855: price_range is the ONLY price-label field. Chunk 1 read it
  // first with a fallback to the legacy alias; chunk 2 dropped the alias
  // column (revision 9849fab1637a), so there is nothing to fall back to.
  // PR #3971: a digit-less label («₪₪») is not a price — it neither renders
  // nor, on its own, makes the signature block appear.
  const producerPriceLabel = isPriceLabel(producer.price_range) ? producer.price_range : null;
  const hasSignature = !!(producer.top_product_name || producerPriceLabel);
  // MEH-1233 B4: the signature product (top_product_name) is a free-text DB
  // label. When it names a product that ALSO has a grid entry, feature that
  // entry's photo in the highlight and DROP it from the grid below (fixes the
  // MEH-1146 chunk B duplicate — C4). Exact name match only; a free-text label
  // with no matching product just renders name + price on the leaf placeholder.
  // MEH-2137 chunk 3: id first, name as the fallback — same ordering and same
  // reasoning as the dashboard matcher (ProductsSection.jsx). Under the name
  // match `.find()` returned whichever duplicate came first in the array, so
  // two products sharing a name made the featured slot depend on row order.
  // The name branch stays live for producers whose backfill left the FK NULL.
  //
  // The fallback is gated on `top_product_id == null` — NOT on the id lookup
  // failing. Those are different conditions and an `||` chain conflates them:
  // when the id is SET but its product is gone (deleted), `||` would fall
  // through to the name and feature a *surviving* product that happens to
  // share the deleted one's `top_product_name` — reintroducing exactly the
  // wrong-row bug this chunk exists to kill, on the surface where a buyer
  // sees it. The dashboard's `isTopProduct` already reads `!= null` and marks
  // nothing in that case; this now agrees with it, so a row featured here is
  // still exactly a row marked there. (Reviewer finding on PR #3048.)
  const signatureProduct =
    producer.top_product_id != null
      ? (producer.products || []).find((p) => p.id === producer.top_product_id) || null
      : producer.top_product_name
        ? (producer.products || []).find(
            (p) => p.name?.trim() === producer.top_product_name.trim(),
          ) || null
        : null;
  const signatureImg = signatureProduct?.image_url
    ? optimizeCloudinary(signatureProduct.image_url, { aspectRatio: "1:1", width: 320 })
    : null;
  // MEH-3021 / MEH-3055: the order is lib/product-order.js — the owner's
  // order when she set one, else photos first; grouped products laid out
  // group by group. The signature product stays out of the grid.
  const productGroups = producer.product_groups || [];
  const gridUnsorted = signatureProduct
    ? (producer.products || []).filter((p) => p.id !== signatureProduct.id)
    : producer.products || [];
  const gridAll = orderProducts(gridUnsorted, productGroups);
  // MEH-3055: chips only when 2+ groups actually hold products (Etsy shows its
  // sections as filters; one group is no choice at all). Counted over the GRID
  // (signature product excluded): a group whose only product is the signature
  // card would be a chip that empties the list.
  const filterGroups = chipGroups(gridUnsorted, productGroups);
  const showGroupChips = filterGroups.length >= 2;
  const liveGroupIds = new Set(productGroups.map((g) => g.id));
  const gridProducts =
    !showGroupChips || activeGroup == null
      ? gridAll
      : activeGroup === UNGROUPED
        ? gridAll.filter((p) => p.group_id == null || !liveGroupIds.has(p.group_id))
        : gridAll.filter((p) => p.group_id === activeGroup);
  // MEH-3021: a long list collapses to 6 rows on the phone, 8 from md (two
  // columns × 4). Up to 8 rows there is no button and everything shows, on
  // both — one threshold, so a list never collapses on one screen size only.
  const collapsible = gridProducts.length > PRODUCTS_PREVIEW_DESKTOP;
  const productsCollapsed = collapsible && !showAllProducts;

  // MEH-2045: the list the sheet pages through — the same products this section
  // renders, in the order it renders them: the signature highlight first (which
  // is exactly the case where MEH-1233 B4 deduped it out of the grid), then the
  // grid rows. Same SET as producer.products, but the VISUAL order, so "next"
  // moves the way the page reads instead of the way the API happened to sort.
  const sheetProducts = signatureProduct
    ? [signatureProduct, ...gridProducts]
    : gridProducts;
  const sheetTotal = sheetProducts.length;
  const openProduct = openIndex == null ? null : sheetProducts[openIndex] || null;

  // Both triggers resolve the position from the product itself rather than from
  // a hand-computed offset, so the signature card's index stays correct without
  // the two call sites each knowing that it sits at 0.
  //
  // Deliberately NOT a useCallback: `sheetProducts` is a fresh array on every
  // render, so a memo keyed on it would be recomputed every render anyway —
  // it would read as stability while providing none. The three handlers below
  // ARE memoized, because for them it does something.
  const openSheetFor = (product) => {
    const i = sheetProducts.findIndex((p) => p.id === product.id);
    // -1 is unreachable from the two call sites below (both iterate this very
    // list). If it ever happens the list moved under an open sheet, and closing
    // beats silently showing whatever now sits at position 0.
    setOpenIndex(i >= 0 ? i : null);
  };
  // Stable identities on purpose: ProductSheet's modal effect depends on
  // `onClose`, and that effect moves focus and re-captures the
  // previously-focused element every time it runs. An inline arrow would hand
  // it a fresh identity on every parent render, so paging would re-run it and
  // pull focus off the chevron the reader is clicking.
  const closeSheet = useCallback(() => setOpenIndex(null), []);
  const goPrevProduct = useCallback(() => setOpenIndex((i) => (i > 0 ? i - 1 : i)), []);
  const goNextProduct = useCallback(
    () => setOpenIndex((i) => (i < sheetTotal - 1 ? i + 1 : i)),
    [sheetTotal],
  );

  // PR #3972: a deep link `?product=<id>` (the recipe page's product rows)
  // opens that product's sheet on arrival. Read once per producer from
  // window.location — not useSearchParams, which would force a Suspense
  // boundary onto a server-rendered page for a one-shot read. An id that
  // matches nothing opens nothing (the page just loads normally).
  // MEH-3055: keyed on the UNFILTERED list (signature + every grid row), so
  // tapping a group chip — which changes the visible list but never removes
  // `?product=` from the URL — does not re-open the sheet. The deep link also
  // clears any chip, so its product is always in the list it opens into.
  const productIds = (signatureProduct ? [signatureProduct, ...gridAll] : gridAll)
    .map((p) => p.id)
    .join(",");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wanted = new URLSearchParams(window.location.search).get("product");
    if (!wanted) return;
    const i = productIds.split(",").indexOf(wanted);
    if (i < 0) return;
    setActiveGroup(null);
    // MEH-3021: a deep link to a product that sits in the collapsed part of
    // the list opens the list too, so closing the sheet lands next to it.
    const gridPos = signatureProduct ? i - 1 : i;
    if (gridPos >= PRODUCTS_PREVIEW_MOBILE) setShowAllProducts(true);
    setOpenIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot read per product set
  }, [productIds]);

  // MEH-1463: when the signature product was deduped out of the grid and
  // the producer-level price_range (MEH-1855: the single price-label field)
  // is not set, surface the matched product's own price/description on the
  // highlight card so the info the dedup removed isn't lost.
  // PR #3971: the product's OWN price now wins over the business-level
  // price_range («מחיר התחלתי»). MEH-1463 had it the other way, which put a
  // business-wide label on one product's card while the sheet for that same
  // product showed its real price (Sapir 31/10: card «₪₪», sheet 32₪). The
  // business label is the fallback for a free-text signature with no priced
  // product. Numeric price → canonical formatPriceRange (MEH-1140) with
  // dir="ltr" bidi isolation; free-text labels are DATA (MEH-1305 F) rendered
  // in natural direction.
  const signatureNumericPrice =
    signatureProduct?.price_min != null
      ? formatPriceRange(signatureProduct.price_min, signatureProduct.price_max)
      : null;
  const signatureFreeTextPrice = signatureNumericPrice
    ? null
    : (isPriceLabel(signatureProduct?.price_range) ? signatureProduct.price_range : null) ||
      producerPriceLabel;

  return (
    <>
      {/* Description — MEH-788: scroll-reveal (motion.section keeps the
          sectionRefs callback ref for the tab-scroll IO). */}
      {producer.description && (
        // MEH-1306: stable id (deep-link target of the edit tab's view-link)
        // + scroll-mt clearing the sticky header/tab bar (the #reviews idiom).
        <FadeInSection as="section" {...REVEAL_PRESET} id="section-bio" className="mt-8 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24" ref={(el) => { sectionRefs.current.about = el; }}>
          <div className="flex items-center gap-2 mb-3">
            <SectionHeading size="content">{t("producer.detail.sections.about")}</SectionHeading>
            <OwnerSectionEditLink producerId={producer.id} anchor="bio" sectionKey="bio" />
          </div>
          <p className="text-text/85 leading-relaxed whitespace-pre-line">
            {producer.description}
          </p>
          {/* MEH-2693: «עסק של מילואימניקים» — a claim about the owners, so
              it sits in «אודות», right above «מאחורי העסק». */}
          <ReservistBadgeLine producer={producer} className="mt-4" />
          {/* MEH-2592: «מאחורי העסק» lives inside «אודות» — who the business
              is and who is behind it, read as one story. */}
          <OwnerCard producer={producer} nested />
        </FadeInSection>
      )}

      {/* MEH-2592: with a description the owner card is nested inside
          «אודות» above; without one there is no «אודות» to sit in, so it keeps
          its own section here, in the same place. Self-gates: null only when
          there is no contact_name, owner_bio or owner_photo_url (MEH-2471). */}
      {/* MEH-2693: no «אודות» section → the reservist pill stands on its own
          in the same place (self-gates to null when not declared). */}
      {!producer.description && <ReservistBadgeLine producer={producer} className="mt-8" />}
      {!producer.description && <OwnerCard producer={producer} />}

      {/* MEH-2648: the rescue bag sits after the header/bio and BEFORE
          products, per the chunk-4 spec — it is tonight's thing and expires,
          the catalogue does not. OUTSIDE the products gate below on purpose:
          a business with a bag and no catalogue must still show the bag. */}
      <RescueSection producer={producer} />

      {/* Products (premium only) + the signature product at the top.
          MEH-1146 chunk B: the section also renders when only the signature
          product exists (no product entries) so the moved-out header
          signature never vanishes. */}
      {(producer.products?.length > 0 || hasSignature) && (
        <section id="section-products" className="mt-12 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24" ref={(el) => { sectionRefs.current.products = el; }}>
          {/* MEH-1306: owner pencil beside the heading → #products card. */}
          <div className="flex items-center gap-2 mb-4">
            <SectionHeading size="content">{t("producer.detail.sections.products.heading")}</SectionHeading>
            <OwnerSectionEditLink producerId={producer.id} anchor="products" sectionKey="products" />
          </div>

          {/* Signature product — moved from ProducerHeader (MEH-1146 chunk B).
              MEH-1233 B4: rendered as a real highlight CARD (thumbnail + name +
              price_range) on the lighter surface-card token, not the
              page-cream `bg-background` box that read as an empty wide row when
              only the name was present. price_range is a free-text DB
              label (NOT routed through formatPrice per MEH-1140 — data, not a
              numeric amount). The photo comes from the matching grid product
              when one exists (that product is deduped out of the grid below);
              otherwise the canonical leaf placeholder (MEH-1138). */}
          {/* MEH-1901: the signature card opens the same sheet as a grid row —
              but ONLY when top_product_name matched a real product row
              (signatureProduct). A free-text label with no matching product has
              no description, no diet flags and no id, so there is nothing for a
              sheet to show; it stays the static card it has always been rather
              than opening an empty overlay. */}
          {hasSignature && (
            <SignatureShell
              product={signatureProduct}
              onOpen={openSheetFor}
              ariaLabel={t("producer.detail.sections.products.sheet_open_aria", {
                name: producer.top_product_name || "",
              })}
            >
              <div className="relative w-28 h-28 md:w-36 md:h-36 flex-shrink-0 rounded-xl overflow-hidden bg-background">
                {signatureImg ? (
                  <Image
                    src={signatureImg}
                    alt={producer.top_product_name || ""}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 144px, 112px"
                  />
                ) : (
                  // MEH-2833 (seed layer): sand + one seed in the business's own
                  // colour, no text (the product name sits beside it).
                  <div
                    className="w-full h-full bg-background-alt flex items-center justify-center"
                    aria-hidden="true"
                    data-testid="signature-image-missing"
                  >
                    <Seed color={seedColorFor(producer.id).fill} size={40} rotate={-36} highlight />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {/* MEH-1463: accent eyebrow so the card reads as "the signature
                    product", not just a bigger unlabeled row. */}
                <p className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-gold-deep">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {t("producer.detail.sections.products.signature_label")}
                </p>
                {producer.top_product_name && (
                  <p className="mt-1.5 font-headline-md text-lg font-bold leading-snug text-text">{producer.top_product_name}</p>
                )}
                {/* MEH-1463: description fallback from the deduped grid product. */}
                {signatureProduct?.description && (
                  <p className="text-sm text-fg-muted mt-0.5 line-clamp-2">{signatureProduct.description}</p>
                )}
                {signatureNumericPrice ? (
                  <p className="text-gold-deep font-bold mt-1"><span dir="ltr">{signatureNumericPrice}</span></p>
                ) : signatureFreeTextPrice ? (
                  <p className="text-gold-deep font-bold mt-1">{signatureFreeTextPrice}</p>
                ) : null}
                <ProductDietPills product={signatureProduct} t={t} />
              </div>
              {/* Forward chevron points LEFT in RTL — same convention as
                  ReviewExcerpt.jsx:86. Only when the card actually opens. */}
              {signatureProduct && (
                <CaretLeft size={14} className="ms-auto shrink-0 text-fg-muted" aria-hidden="true" />
              )}
            </SignatureShell>
          )}

          {/* MEH-1168 P2: compact product ROWS (approved 1b anatomy), replacing
              the giant image-first cards. Each row = a square thumbnail at the
              inline-start + name/price beside it, ~96px tall, hairline-separated.
              Desktop lays the rows out in two columns (fixes the old 2+1
              asymmetric card grid). Prices via formatPriceRange (MEH-1140) with
              dir="ltr" bidi isolation (regression baseline:
              qa-artifacts/MEH-1168-p1/price-cell-zoom.webp). */}
          {showGroupChips && (
            <ProductGroupChips
              groups={filterGroups}
              withUngrouped={hasUngrouped(gridUnsorted, productGroups)}
              active={activeGroup}
              onChange={(id) => {
                setActiveGroup(id);
                setShowAllProducts(false);
              }}
            />
          )}
          {gridProducts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6 border-t border-border">
              {(productsCollapsed ? gridProducts.slice(0, PRODUCTS_PREVIEW_DESKTOP) : gridProducts).map((product, idx) => {
                // MEH-3021: rows 7–8 exist for the desktop preview only.
                const desktopOnly = productsCollapsed && idx >= PRODUCTS_PREVIEW_MOBILE;
                // Cloudinary 1:1 square when a photo exists; otherwise the
                // canonical no-photo state (MEH-1138) — never a package icon.
                const img = product.image_url
                  ? optimizeCloudinary(product.image_url, { aspectRatio: IMAGE_RATIOS.square, width: 160 })
                  : null;
                // MEH-1305 F: numeric prices go through the canonical
                // formatPriceRange (MEH-1140) and are bidi-isolated; a free-text
                // price_range is DATA (MEH-1140 — never reformatted) and renders
                // in the natural direction, since forcing dir="ltr" corrupts a
                // Hebrew-bearing label like "מ-30₪" / "30₪ לחבילה".
                const numericPrice =
                  product.price_min != null
                    ? formatPriceRange(product.price_min, product.price_max)
                    : null;
                const freeTextPrice = numericPrice ? null : product.price_range || null;
                return (
                  // MEH-1901: the row is the trigger for the product sheet, so
                  // it is a real <button> (keyboard + AT reachable), not a div
                  // with a click handler. min-h-[96px] already clears the 44px
                  // tap-target floor. Its accessible name is the product name;
                  // the visible children stay exactly as they were.
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => openSheetFor(product)}
                    aria-label={t("producer.detail.sections.products.sheet_open_aria", {
                      name: product.name,
                    })}
                    data-testid="product-row"
                    className={`${desktopOnly ? "hidden md:flex" : "flex"} w-full text-start items-center gap-3 py-2 min-h-[96px] border-b border-border transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40`}
                  >
                    <div className="relative w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-background">
                      {img ? (
                        <Image
                          src={img}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      ) : (
                        // MEH-1305 E: typographic no-photo cell — the product's
                        // initial in Frank Ruhl (font-headline-md) on a
                        // bg-primary/[0.06] tint, NO leaf glyph. Realises
                        // MEH-1126's "אין placeholder אייקון" intent for the grid
                        // (supersedes the MEH-1168 P1 leaf), so photo and
                        // no-photo grid cells read as one calm, uniform system.
                        <div
                          className="w-full h-full bg-primary/[0.06] flex items-center justify-center"
                          aria-label={t("producer.card.aria.image_missing", { name: product.name })}
                          role="img"
                        >
                          <span className="font-headline-md text-2xl text-primary/40" aria-hidden="true">
                            {product.name?.trim()?.[0] || "•"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text">{product.name}</p>
                      {/* MEH-1901: the row clamp goes from one line to two. One
                          line was too little to judge whether the sheet is worth
                          opening; the full text now lives in the sheet either
                          way. (Worded without the old class name on purpose —
                          the ticket's verification greps the repo for it.) */}
                      {product.description && (
                        <p className="text-sm text-fg-muted mt-0.5 line-clamp-2">{product.description}</p>
                      )}
                      {/* Same price cell/position for every card. MEH-1168 P1:
                          the ₪-suffixed numeric amount is bidi-isolated so RTL
                          flow can't render "35₪" as "₪35". */}
                      {numericPrice && (
                        <p className="text-accent font-medium mt-1"><span dir="ltr">{numericPrice}</span></p>
                      )}
                      {freeTextPrice && (
                        <p className="text-accent font-medium mt-1">{freeTextPrice}</p>
                      )}
                      {/* PR #3974 (Sapir 31/10): the card on the listing shows
                          «צמחוני +4», and the page never said WHICH products
                          carry them. Each row now names its own flags — icon +
                          the same label as the sheet (MEH-2584 icon+word). */}
                      <ProductDietPills product={product} t={t} />
                    </div>
                    {/* Forward chevron points LEFT in RTL (ReviewExcerpt.jsx:86). */}
                    <CaretLeft size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
          {/* MEH-3021: same look as «הצגת כל האירועים» (ProducerActivities). */}
          {collapsible && (
            <ShowMore
              data-testid="products-toggle"
              expanded={showAllProducts}
              onClick={() => {
                if (showAllProducts) {
                  setShowAllProducts(false);
                  // Back to the top of the section, or the reader is left
                  // deep below a list that just got shorter.
                  sectionRefs.current.products?.scrollIntoView({ block: "start" });
                } else {
                  setShowAllProducts(true);
                }
              }}
              className="mt-4"
              label={showAllProducts
                ? t("producer.detail.sections.products.show_less")
                : t("producer.detail.sections.products.show_all", {
                    // MEH-3055: with a chip on, «all N» means all N in that group.
                    count: !showGroupChips || activeGroup == null ? sheetTotal : gridProducts.length,
                  })}
            />
          )}

          {/* PR #3974: the gluten production-facility sentence lives with the
              products it qualifies (was in the header, under the kashrut chip,
              where it read as a note about the whole business page). Same
              string and plain-text styling (MEH-1508 ch2: no badge/icon). The
              header keeps it only when there are no products to sit under. */}
          {producer.products?.length > 0 && producer.gluten_free_facility === "shared" && (
            <p className="text-xs text-fg-muted leading-relaxed max-w-prose mt-3" data-testid="gluten-facility-shared">
              {t("producer.detail.header.gluten_facility.shared")}
            </p>
          )}
          {producer.products?.length > 0 && producer.gluten_free_facility === "dedicated" && (
            <p className="text-xs text-fg-muted leading-relaxed max-w-prose mt-3" data-testid="gluten-facility-dedicated">
              {t("producer.detail.header.gluten_facility.dedicated")}
            </p>
          )}

          {/* MEH-1901: mounted inside the products section, rendered only while
              a product is open. `position: fixed` + backdrop, so the DOM
              position has no bearing on where it paints. */}
          {/* MEH-2045: index/total/onPrev/onNext are the whole paging contract
              — the sheet stays prop-derived and owns no copy of the list. */}
          {openProduct && (
            <ProductSheet
              product={openProduct}
              producer={producer}
              index={openIndex}
              total={sheetTotal}
              onPrev={goPrevProduct}
              onNext={goNextProduct}
              onClose={closeSheet}
            />
          )}
        </section>
      )}

      {/* MEH-591: Producer recipes (chunk 4/4). Section is hidden entirely
          when the producer has no published+approved recipes — empty state
          is silent per spec. Anchor id matches the breadcrumb in
          RecipeDetail.jsx ("חזרה לדף בית העסק > מתכונים"). */}
      {producer.slug && recipes.length > 0 && (
        <section className="mt-12" id="recipes">
          <SectionHeading size="content" className="mb-4">
            {t("producer.detail.sections.recipes.cta")}
          </SectionHeading>
          {/* MEH-3006 (option B): phones — one sideways-scrolling strip of
              medium cards, bleeding to the screen edge (-me-4 pe-4 cancels the
              page gutter) so the next card peeks; same height for one recipe
              or many. md+ — the same cards in a 3-column grid. */}
          <div
            data-testid="producer-recipes-grid"
            className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity -me-4 pe-4 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:me-0 md:pe-0"
          >
            {recipes.map((r) => (
              <RecipeCard key={r.id} slug={producer.slug} recipe={r} />
            ))}
          </div>
        </section>
      )}

      {/* Events + experiences (one list) and open group buys — MEH-2602,
          reshaped under MEH #2659. */}
      <ProducerActivities producerId={producer.id} events={events} sectionRefs={sectionRefs} />

      {/* Reviews — IO-lazy: only mounts the fetch when the section
          scrolls within 300px of the viewport (saves ~300ms on 3G).
          MEH-1048: id="reviews" is the anchor target for the header trust
          strip; scroll-mt-24 offsets the landing so the heading isn't
          flush against the top. The wrapper always renders (it's the IO
          observation point), so the anchor is valid before reviews mount. */}
      <div
        id="reviews"
        // MEH-1168 P2: on mobile the anchor must clear BOTH the sticky header
        // and the now-visible section tab bar (which sticks below it); desktop
        // has no tab bar so it keeps the header-only offset.
        // MEH-1202: mobile offset = live header height (`--chrome-top`) + the
        // tab-bar band, replacing the hardcoded 150px. Desktop keeps
        // the header-only scroll-mt-24 (no tab bar there).
        // MEH-1207: the band is now the anchor-nav's LIVE height
        // (`--section-nav-h`, published by SectionAnchorNav); 68px is only the
        // first-paint fallback.
        className="scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
        ref={(el) => {
          sectionRefs.current.reviews = el;
          reviewsContainerRef.current = el;
        }}
      >
        {reviewsVisible && (
          <ReviewsSection
            producerId={producer.id}
            avgRating={producer.avg_rating ?? 0}
            reviewCount={producer.reviews_count ?? 0}
            isOwner={isOwner}
            onTotalChange={onReviewsTotalChange}
            producerName={producer.name}
          />
        )}
      </div>

      {/* MEH-1490: quiet Google-rating trust line — detached from the native
          reviews block above (its own border-t + margin, ToS visual separation
          + cannibalization guard). Mount is gated on a mapped place_id so
          unmapped producers make zero requests; the component itself renders
          nothing on a 204 (< 20 reviews / API error / no key). */}
      {producer.google_place_id && (
        // MEH-2581: keyed so a client-side move to another business starts
        // fresh (no previous business's rating, no carried-over inView).
        <GoogleRatingLine key={producer.id} producerId={producer.id} producerName={producer.name} />
      )}

      {/* MEH-1168 P3 (decision A): the editorial DeliveryBlock now serves ALL
          producers — the legacy delivery_areas table retired from this page. It
          is fed the full delivery_areas (city · min order · day) + pickup_points
          and renders whenever the producer has any delivery/pickup signal
          (offers_delivery, delivery_areas rows, or pickup_points). Its WhatsApp
          order CTA stays tone="tertiary" so it never competes with the contact
          card's single primary CTA. */}
      {(producer.offers_delivery ||
        producer.delivery_areas?.length > 0 ||
        producer.pickup_points) && (
        // MEH-1207: stable id = the anchor-nav's delivery target; scroll-mt
        // clears the sticky header + nav (same idiom as #reviews below).
        <div
          id="section-delivery"
          className="scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
          ref={(el) => { sectionRefs.current.delivery = el; }}
        >
          <DeliveryBlock
            nationwide={producer.delivery_nationwide}
            excluded={producer.delivery_excluded_cities || []}
            areas={producer.delivery_areas || []}
            pickup={!!producer.pickup_points}
            producer={producer}
          />
        </div>
      )}

      {/* MEH-1875 (history — MEH-2803 below supersedes the placement): the
          weekly order schedule, immediately BEFORE the location
          section that held the store-hours card — the two "when" blocks read
          together, and the page IA keeps location as the last content section.
          It is its OWN section rather than a card inside "הגעה ומיקום" for two
          reasons: an order window is not a location fact (a delivery-only
          business with no address would otherwise never show its schedule,
          because that section is gated on location||opening_hours), and a
          visitor scanning for "when can I order" does not look under a heading
          that says "arrival and location". Schedule only — the open/closed
          verdict stays in ProducerHeader alone (MEH-1305 A). Self-gating:
          renders nothing at all when order_window is null. */}
      {/* MEH-2803: the ONE «שעות» section — order window («מקבלים הזמנות») and
          store hours («פתוח למבקרים») each under its own label, or one set
          («הזמנות וביקור במקום») when they match day by day. Store hours left
          the location section below: the same fact in two sections read as a
          duplicate. Self-gating: nothing at all when there are no hours. */}
      <ProducerHoursSection producer={producer} />

      {/* MEH-1146 chunk B: location is the LAST content section. MEH-1334
          chunk 3: merged into ONE "הגעה ומיקום" section (mockup Z3) — heading
          + address line (city ONLY — street address is admin/owner-private
          per MEH-829, decision 3) + collapsed OpeningHours + the Leaflet
          MiniMap (never a Google embed) with brand nav buttons. The owner
          pencil (MEH-1306) moved inline beside the heading, matching the
          bio/products idiom. */}
      {/* MEH-2142: the gate reads the RESOLVED hours, not the legacy column.
          Both halves have to move together — gating on `producer.opening_hours`
          while rendering the resolved value would hide the whole section from a
          business whose hours live only on her primary location row, which is
          exactly the business this change is for. */}
      {/* MEH-2803: gate → hasLocation, SUPERSEDING the two notes above (the
          collapsed OpeningHours here and the hours-OR-location gate). Store
          hours moved up into «שעות»; a business with hours but no place to
          arrive at has no location section (section-nav.js mirrors this gate).
          storeHours is still read here, only for the no-hours line. */}
      {hasLocation && (
        <section
          id="section-location"
          className="mt-12 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
        >
          <div className="flex items-center gap-2 mb-3">
            <SectionHeading size="content">
              {t("producer.detail.sections.location")}
            </SectionHeading>
            <OwnerSectionEditLink producerId={producer.id} anchor="location" sectionKey="location" />
          </div>
          {/* Address line — city-only fallback, never empty (revision-1 #5). */}
          {producer.city && (
            <FactLine icon={MapPin} className="text-sm text-fg-muted mb-3">
              {producer.city}
            </FactLine>
          )}
          {/* MEH-2438 follow-up: a place to visit with no hours would otherwise
              show only the map and the Waze/Google buttons — an invitation to
              turn up unannounced at a home producer. */}
          {/* MEH-3028: a fact line like the city above it, so it leads with
              its kind's icon (clock) — the city had a pin and this had none. */}
          {!storeHours && (
            <FactLine icon={Clock} data-testid="location-no-hours" className="text-sm text-fg-muted mb-3">
              {t("producer.detail.sections.location_no_hours")}
            </FactLine>
          )}
          {/* MEH-1611 chunk 2: the map now shows every point this business has
              — its branch plus each pickup / market stand — not just the primary
              pin. Complements the textual pickup list DeliveryBlock renders
              (MEH-1512): same rows, one as a list, one on a map. */}
          {hasLocation && (
            <MiniMap
              lat={primaryPin.lat}
              lng={primaryPin.lng}
              name={producer.name}
              locations={producer.locations}
              producer={producer}
            />
          )}
        </section>
      )}

      {/* MEH-2592: the page-end fine print — everything about THIS business
          ends here, before the other-businesses band (rendered by
          ProducerDetail, full width, below both columns). The disclaimer is
          legal copy and stays word for word (MEH-1548), only its container
          changed. MEH-2999 (Sapir chose option A, 12/11): a hairline above,
          an info icon beside the disclaimer, and the three meta items on ONE
          quiet row — last-updated · correction link · report (signed-in only)
          — instead of three stacked lines with a red report link. Order:
          disclaimer → that row. */}
      <div className="mt-12 border-t border-border pt-5" data-testid="producer-fine-print">
        {/* Directory-only disclaimer — required by Israeli consumer
            protection law. The seller bears legal responsibility for
            products and licensing; the platform is just a directory. */}
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
          <DirectoryDisclaimer />
        </div>
        <div
          className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted"
          data-testid="producer-fine-print-meta"
        >
          {/* MEH-1291: last-updated freshness signal. Renders ONLY when a real
              edit has stamped producer.updated_at (nullable, no backfill), so
              untouched producers show nothing. Month-year granularity. */}
          {producer.updated_at && (
            <span className="whitespace-nowrap">
              {t("producer.detail.last_updated", {
                date: formatEventDate(producer.updated_at, locale, {
                  month: "long",
                  year: "numeric",
                }),
              })}
              {/* the dot rides with its item, so a wrap never strands it */}
              <span aria-hidden="true" className="ms-2">·</span>
            </span>
          )}
          {/* MEH-1460: quiet "טעות בפרטים? עדכנו אותנו" correction link (opens
              the MEH-1443 email-only modal). */}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="underline hover:text-text transition"
          >
            {t("producer.detail.contact_card.report_info_link")}
          </button>
          {/* Signed-in only (ReportButton returns null for a guest), so it
              carries its own leading separator. */}
          <ReportButton producerId={producer.id} quiet />
        </div>
      </div>

      <ReportInfoModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        producerSlug={producer.slug || producer.id}
      />
    </>
  );
}
