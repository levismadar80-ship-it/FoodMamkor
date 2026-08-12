"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CaretLeft, Images, SealCheck } from "@phosphor-icons/react";
import { Link as LocaleLink } from "@/i18n/navigation";
import ImageWithFallback from "./ImageWithFallback";
import FavoriteButton from "./FavoriteButton";
import ShareButton from "./ShareButton";
import Lightbox from "./Lightbox";
import Popover from "./ui/Popover";
// MEH-1843: one owner for the verified-popover body so the masthead seal and
// BadgeRow's hero chip cannot drift apart on the same page.
import { getVerifiedPopoverBody } from "./BadgeRow";

// The hero corner overlay is mobile-only; the desktop hero stays clean because
// both controls live in the header's quiet-actions row there.
// MEH-1334 (decision 6) made that corner SHARE-only and gave the heart a single
// home in the header row. MEH-1693 reverses the heart half: below lg the row no
// longer renders at all, so the corner carries BOTH circles (share + heart) and
// the row is the desktop-only pair. `onFavorited` is forwarded to the heart so
// the page — not this component — owns the post-save AlertPrefsPanel.
// MEH-1843: verificationDocType / verifiedAt feed the masthead popover body,
// which must match BadgeRow's hero popover word-for-word (both render on the
// same producer page). Passed as narrow scalars rather than the producer object
// to match this component's existing prop style (producerId / producerName /
// verified are all scalars). Absent → getVerifiedPopoverBody falls back to the
// generic dateless sentence, which is still true, just less specific.
export default function ImageGallery({ images = [], producerId = null, producerName = "", verified = false, verificationDocType = null, verifiedAt = null, shareUrl = "", onFavorited }) {
  const t = useTranslations("gallery");
  // MEH-1168 P2: the verified "מאומת" seal anchors to the name. For imageless
  // producers the name lives here in the Tinted Masthead (ProducerHeader omits
  // its h1), so the seal is rendered beside it here rather than floating alone
  // in the header badge row below. Label reuses the badge namespace.
  const tBadge = useTranslations("producer.badge");
  const [current, setCurrent] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);
  // Keep a ref to the currently displayed image so Lightbox can return focus to it
  const imageButtonRef = useRef(null);
  // MEH-1247: the specific trigger element that opened the lightbox. The desktop
  // editorial grid cells (hero / secondary) have no ref of their own, so restoring
  // focus to `imageButtonRef` (the md:hidden mobile banner) sent focus to a
  // display:none element on desktop → the WAI-ARIA "return focus to invoker"
  // contract broke and the E2E focus assertion flaked. Capture the actual invoker
  // on open and restore focus to it on close (WAI-ARIA dialog pattern).
  const triggerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((e) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swiped left → next (RTL: previous visual)
        setCurrent((c) => (c + 1) % images.length);
      } else {
        // Swiped right → previous (RTL: next visual)
        setCurrent((c) => (c - 1 + images.length) % images.length);
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  }, [images.length]);

  // MEH-1047: open the lightbox at a specific image. The desktop editorial
  // grid cells open at their own index; the mobile carousel opens at `current`.
  const openLightbox = useCallback((index, trigger) => {
    setCurrent(index);
    // MEH-1247: remember the invoker so focus returns to it on close.
    if (trigger) triggerRef.current = trigger;
    setLightboxOpen(true);
  }, []);

  // MEH-815: imageless state renders the "Tinted Masthead" editorial hero
  // (Sapir-approved, Claude Design) instead of the old emoji+initials box.
  // Text-led, shorter than the imaged carousel. The producer name is the
  // page's sole <h1> here (ProducerHeader omits its own h1 when imageless,
  // so the name appears exactly once). Surface = green #2e6853 tint over
  // cream at 6% (ADR-019 opacity-on-cream — token + opacity, no hex token).
  // Recessive מ·ה brand monogram sits at the corner, gold, never dominant.
  if (!images.length) {
    return (
      <div
        className="relative w-full rounded-md bg-background border border-border overflow-hidden"
        data-testid="gallery-empty-state"
      >
        {/* 6% green tint over the cream surface beneath (ADR-019) */}
        <div
          className="relative bg-primary/[0.06] px-6 pb-6 pt-16 md:pt-20 flex items-end min-h-[120px] md:min-h-[150px]"
          data-testid="gallery-tint-layer"
        >
          {/* Recessive brand monogram — corner mark (end side, opposite the
              favorite control), gold, ~24px. Decorative, never dominant.
              MEH-2025: SVG text, not an HTML text node. axe audits every
              visible HTML text node for color-contrast (aria-hidden included)
              and the recessive 40% fill measures 1.66:1; WCAG 1.4.3 exempts
              purely decorative text, but an HTML text node has no way to say
              so — an SVG mark is the standard encoding of that exemption.
              The passing alternative (opacity >= /80, measured 3.04:1) would
              make the mark dominant, which the recessive LOCK above forbids.
              Same glyphs/font/fill; box 34x24 at the same corner (span box
              measured 33x24 before the swap). */}
          <svg
            className="absolute top-3 end-3 select-none pointer-events-none overflow-visible"
            width="34"
            height="24"
            viewBox="0 0 34 24"
            aria-hidden="true"
            focusable="false"
          >
            <text
              x="17"
              y="19"
              textAnchor="middle"
              fontSize="24"
              className="font-headline-lg fill-accent/40"
            >
              מ·ה
            </text>
          </svg>
          {/* MEH-815: h1 rendered unconditionally — ProducerHeader always omits
              its own name h1 when imageless, so the masthead must always supply
              the page's single h1 (guarantees exactly-one-h1 even for the
              backend-impossible empty-name case).
              MEH-1168 P2: the verified seal sits inline after the name (anchored
              to it, not floating in the header badge row). Masthead is otherwise
              unchanged (MEH-815 LOCK). */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
            <h1 className="font-headline-lg text-5xl md:text-6xl font-black text-text leading-tight">
              {producerName}
            </h1>
            {/* MEH-1358: the masthead seal opens the SAME verification popover
                as the header seal (BadgeRow hero branch) — imageless verified
                producers previously had a static span and no way to open the
                verification story. Content/copy keys and a11y (sheetOnMobile,
                Esc, focus-return) are byte-identical to BadgeRow.jsx; gating
                is unchanged (`verified` = verification_tier === "verified",
                ProducerDetail.jsx). Pill visuals unchanged from MEH-1168. */}
            {verified && (
              <Popover
                role="dialog"
                sheetOnMobile
                // MEH-1593 (surface 5): the masthead's own wrapper is
                // `relative … overflow-hidden`, and it IS this panel's
                // containing block — measured 27/07, 86.75px of the panel was
                // cut off at 1440px (panel bottom 395px vs ancestor bottom
                // 308px). `overlay` portals it out; no avoidRef needed, the
                // panel already had 0 sibling intersections.
                overlay
                contentTestId="badge-tooltip-verified"
                contentClassName="w-64 flex flex-col gap-1.5"
                sheetContentClassName="flex flex-col gap-2"
                trigger={
                  <button
                    type="button"
                    aria-label={tBadge("aria_verified_plain")}
                    data-testid="masthead-verified"
                    data-badge="verified"
                    className="group inline-flex items-center justify-center focus:outline-none"
                  >
                    {/* MEH-2025: bg-accent/10 -> bg-surface-card. Over the masthead's
                        6%-tint-on-cream the accent/10 fill composites to #dfdbcb and
                        text-accent measures 3.77:1 (axe serious, AA needs 4.5). On the
                        solid surface-card fill it measures 5.19:1. Same idiom as the
                        icon-only chip branch in BadgeRow.jsx (bg-surface-card +
                        border-accent/40 + text-accent). */}
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-surface-card text-accent text-sm px-2.5 py-0.5 font-medium group-focus-visible:ring-2 group-focus-visible:ring-accent/40 transition">
                      <SealCheck size={16} aria-hidden="true" />
                      {tBadge("verified_label")}
                    </span>
                  </button>
                }
              >
                <span className="flex items-center gap-1.5 font-bold text-sm text-text">
                  <SealCheck size={18} className="text-primary" weight="fill" aria-hidden="true" />
                  {tBadge("verified_popover_title")}
                </span>
                <span className="block text-[13px] leading-relaxed">
                  {getVerifiedPopoverBody(
                    { verification_doc_type: verificationDocType, verified_at: verifiedAt },
                    tBadge
                  )}
                </span>
                {/* MEH-1840: retargeted /about#verification → /about/process, in
                    lockstep with the identical popover in BadgeRow.jsx. Both render
                    on the producer page, so a split target would send the same copy
                    to two destinations. The /about#verification anchor stays live. */}
                <LocaleLink
                  href="/about/process"
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-dark"
                >
                  {tBadge("verified_popover_link")}
                  {/* Forward chevron points LEFT in RTL (MEH-1334 revision-1 #11) */}
                  <CaretLeft size={13} aria-hidden="true" />
                </LocaleLink>
              </Popover>
            )}
          </div>
        </div>
        {/* MEH-1693: imageless masthead — same two-circle hero cluster as the
            imaged branch below. gap-2 matches the grid's own gap so the pair
            reads as one control group. Mutually exclusive with that branch
            (this arm returns early), so only ONE heart mounts per render. */}
        {producerId && (
          <div className="absolute top-3 start-3 z-10 lg:hidden flex items-center gap-2">
            <ShareButton variant="overlay" url={shareUrl} title={producerName} />
            <FavoriteButton
              producerId={producerId}
              producerName={producerName}
              variant="gallery"
              onFavorited={onFavorited}
            />
          </div>
        )}
      </div>
    );
  }

  // MEH-1047: a single image keeps the current full-width banner at every
  // breakpoint; 2+ images get the desktop editorial grid (md+) with the
  // mobile carousel kept below (chunk 2 restyles the mobile path).
  const single = images.length === 1;

  return (
    <>
    {/* MEH-1047: shared relative wrapper so a single FavoriteButton overlays
        the top-start corner of whichever layout is visible (desktop grid hero
        or mobile carousel) — one mount, one /users/me/favorites fetch. */}
    <div className="relative">
    {/* MEH-1047: desktop editorial grid (Direction B) — hero at inline-start
        + tall stacked secondary column (≤2 cells). The bottom cell of a
        stacked pair carries the single view_all (N) overlay pill (gallery.view_all). */}
    {!single && (
      <div
        className={`hidden md:grid gap-2 rounded-xl overflow-hidden border border-accent/30 h-[420px] lg:h-[460px] max-h-[460px] grid-cols-[62%_1fr] ${
          images.length >= 3 ? "grid-rows-2" : ""
        }`}
        data-testid="gallery-grid"
      >
        {/* Hero cell — inline-start; spans both rows when a stacked pair exists */}
        <button
          type="button"
          onClick={(e) => openLightbox(0, e.currentTarget)}
          aria-label={t("open_aria", { current: 1 })}
          className={`relative overflow-hidden bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 ${
            images.length >= 3 ? "row-span-2" : ""
          }`}
          data-testid="gallery-grid-hero"
        >
          {/* MEH-1047 LCP: images[0] is the desktop LCP → eager `priority`.
              The mobile banner (below) is eager for its own breakpoint; every
              other image (secondary cells, off-screen slides) is lazy via
              next/image's default. Responsive dual-tree double-preloads the
              hero on the hidden breakpoint, but `sizes` bounds that fetch
              (~45vw mobile / ~60vw desktop) — accepted art-direction cost. */}
          <ImageWithFallback
            src={images[0]}
            alt={t("image_alt", { current: 1 })}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 40vw, 45vw"
          />
        </button>
        {/* Secondary cells — images[1] (+ images[2] when 3+). */}
        {images.slice(1, 3).map((src, i) => {
          const idx = i + 1;
          const isPillCell = images.length >= 3 && idx === 2;
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => openLightbox(idx, e.currentTarget)}
              aria-label={
                isPillCell
                  ? t("view_all", { n: images.length })
                  : t("open_aria", { current: idx + 1 })
              }
              className="relative overflow-hidden bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
              data-testid={isPillCell ? "gallery-grid-pill-cell" : "gallery-grid-cell"}
            >
              <ImageWithFallback
                src={src}
                alt={t("image_alt", { current: idx + 1 })}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 25vw, 30vw"
              />
              {isPillCell && (
                <span
                  className="absolute bottom-3 end-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-label-md text-white shadow-md pointer-events-none"
                  data-testid="gallery-all-pill"
                >
                  <Images size={16} weight="bold" aria-hidden="true" />
                  {t("view_all", { n: images.length })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    )}
    <div
      className={`relative h-52 rounded-md overflow-hidden bg-gray-100${single ? "" : " md:hidden"}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        ref={imageButtonRef}
        type="button"
        onClick={(e) => openLightbox(current, e.currentTarget)}
        aria-label={t("open_aria", { current: current + 1 })}
        className="absolute inset-0 w-full h-full focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
      >
        <ImageWithFallback
          src={images[current]}
          alt={t("image_alt", { current: current + 1 })}
          fill
          priority={current === 0}
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 60vw"
        />
      </button>
      {images.length > 1 && (
        <>
          {/* MEH-1047 chunk 2: counter chip (1/N) at top-end — opposite the
              favorite (top-start); dark scrim keeps it legible over any photo.
              .numeric bidi-isolates the fraction so RTL can't flip "1/5". */}
          <div
            className="absolute top-3 end-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-label-md text-white numeric pointer-events-none"
            data-testid="gallery-counter"
          >
            {current + 1}/{images.length}
          </div>
          {/* MEH-1047 chunk 2: thin gold progress bar (replaces the dots).
              Fill width tracks the current slide; decorative — swipe drives
              navigation, tap opens the lightbox for full arrow-key nav. */}
          <div
            className="absolute bottom-0 inset-x-0 h-1 bg-white/30"
            data-testid="gallery-progress"
            aria-hidden="true"
          >
            <div
              className="h-full bg-accent transition-[width] duration-base ease-quart"
              style={{ width: `${((current + 1) / images.length) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
    {/* MEH-1334: mobile overlay for the imaged state — pinned top-start
        (right, RTL) over the hero corner. z-20 clears the counter chip /
        pill (z-10).
        MEH-1693: the heart is BACK beside the share circle, reclaiming the
        MEH-1047 slot it was pulled from. MEH-1334 decision 6 removed it to
        kill a ❤️-hero/actions-row duplication; that duplication is gone now
        that the row is desktop-only, so the removal's premise no longer
        holds. Both circles share one anatomy (bg-white/95, w-11 h-11,
        rounded-full, shadow-md) — ShareButton's overlay variant was written
        to mirror FavoriteButton's gallery circle, so they match by
        construction rather than by copied class strings. */}
    {producerId && (
      <div className="absolute top-3 start-3 z-20 lg:hidden flex items-center gap-2">
        <ShareButton variant="overlay" url={shareUrl} title={producerName} />
        <FavoriteButton
          producerId={producerId}
          producerName={producerName}
          variant="gallery"
          onFavorited={onFavorited}
        />
      </div>
    )}
    </div>
    {lightboxOpen && (
      <Lightbox
        images={images}
        startIndex={current}
        onClose={() => {
          setLightboxOpen(false);
          // MEH-1247: return focus to the actual invoker (desktop grid cell or
          // mobile banner), falling back to the mobile banner ref if unknown.
          (triggerRef.current || imageButtonRef.current)?.focus?.();
        }}
      />
    )}
    </>
  );
}
