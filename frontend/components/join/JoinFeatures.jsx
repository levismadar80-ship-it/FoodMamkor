"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  CalendarBlank,
  Certificate,
  ChartLineUp,
  ChatCircleText,
  Check,
  Clock,
  CookingPot,
  CursorClick,
  Eye,
  Image as ImageIcon,
  LinkSimple,
  MagnifyingGlass,
  MapPin,
  Medal,
  NavigationArrow,
  PaperPlaneTilt,
  Pause,
  PencilSimple,
  Play,
  QrCode,
  ShareNetwork,
  ShieldCheck,
  ShoppingBag,
  Star,
  Storefront,
  Tag,
  TrendUp,
  Truck,
  UsersThree,
} from "@phosphor-icons/react";

import {
  BUSINESS_FEATURE_GROUPS,
  countVisibleBusinessFeatures,
  visibleBusinessFeatures,
} from "@/lib/business-features";
import { rescueBagsEnabled } from "@/lib/rescue";
import FeatureTip from "./FeatureTip";

/**
 * Module:   JoinFeatures
 * Purpose:  The «מה מקבלים» section of /join (MEH-2799): six groups of business
 *           tools from the registry. Phone (<700px) = a horizontal shelf of six
 *           cards, the selected one playing its clip; desktop = a compact list
 *           beside a stage (the selected clip above its panel). Each panel has
 *           4 tiles + a ✓ list of the group's other tools, with "?" toggletips.
 * Touches:  nothing remote — same-origin media under /images/join/ (CSP
 *           default-src 'self' covers it, next.config.js:82).
 * Does NOT: own the list or its words — lib/business-features.js owns what
 *           exists, messages/{he,en}.json `business_features` owns the copy.
 *           Never duplicate a tool here as JSX: that is what codeRef prevents.
 *           No carousel library, no auto-advance, no custom player.
 * Related:  lib/business-features.js (registry + flag); components/join/
 *           FeatureTip.jsx; app/[locale]/join/page.js (the only mount).
 * History:  MEH-2799 (creation).
 *
 * ONE ELEMENT PER CONTROL (frontend.md, MEH-2776): the six cards are one list
 * that reflows with responsive classes — a shelf on phone, a column on
 * desktop. Only the MEDIA has two homes (in the card on phone, in the stage on
 * desktop), and exactly one <video> exists at a time: it mounts where the
 * current viewport puts it, every other slot shows the poster.
 *
 * VIDEO BYTES: every <video> is preload="none" and only the selected group's
 * one exists. It is played only while ≥50% on screen, so nothing downloads
 * before the section is in view, and it pauses when scrolled away.
 */

const DESKTOP_QUERY = "(min-width: 700px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MEDIA_DIR = "/images/join";
const CLIP_WIDTH = 600;
const CLIP_HEIGHT = 480;
const IN_VIEW_RATIO = 0.5;
const STAGGER_MS = 30;
// "Forward" (the next group) enters from the inline-END side, so the sign
// flips with the document direction: /he is RTL, /en is LTR.
const PANEL_SHIFT_CLASS = {
  forward: "rtl:-translate-x-[14px] ltr:translate-x-[14px]",
  back: "rtl:translate-x-[14px] ltr:-translate-x-[14px]",
};
// The sticky site header is 96px at its tallest; the stage is never scrolled under it.
const HEADER_CLEARANCE_PX = 96;

/** Registry `tile.icon` (a Phosphor export name) → the imported component. */
const TILE_ICONS = {
  Image: ImageIcon,
  Tag,
  Clock,
  PencilSimple,
  LinkSimple,
  MapPin,
  ShareNetwork,
  QrCode,
  ChatCircleText,
  PaperPlaneTilt,
  Truck,
  NavigationArrow,
  UsersThree,
  CalendarBlank,
  CookingPot,
  ShoppingBag,
  ShieldCheck,
  Certificate,
  Medal,
  Star,
  Eye,
  CursorClick,
  TrendUp,
};

/** The icon in each group card's chip. */
const GROUP_ICONS = {
  page: Storefront,
  found: MagnifyingGlass,
  contact: ChatCircleText,
  return: ArrowsClockwise,
  trust: ShieldCheck,
  insights: ChartLineUp,
};

function useMediaQuery(query) {
  const [matches, setMatches] = useState(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event) => setMatches(event.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

function SampleLabel({ text }) {
  return (
    <span
      data-testid="join-sample-label"
      className="pointer-events-none absolute top-2 start-2 rounded-sm bg-background/90 px-2 py-0.5 text-2xs font-medium text-fg-muted"
    >
      {text}
    </span>
  );
}

/** The selected group's clip: muted loop, plays only while on screen, with a pause control (WCAG 2.2.2). */
/**
 * `paused` lives in JoinFeatures, not here: one pause choice covers every
 * group's clip (a user who stopped the motion should not have to stop it again
 * on each card — the WCAG 2.2.2 intent).
 */
function GroupClip({ group, alt, labels, paused, setPaused }) {
  const videoRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      // The LAST entry is the current state; a busy main thread can deliver several.
      (entries) => setInView(entries[entries.length - 1].intersectionRatio >= IN_VIEW_RATIO),
      { threshold: [0, IN_VIEW_RATIO] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (inView && !paused) {
      const started = el.play?.();
      // Only a refused autoplay counts as "paused". An AbortError just means
      // pause() interrupted a play() still waiting on preload="none" bytes —
      // treating that as the user's choice froze the clip for good.
      started?.catch?.((error) => {
        if (error?.name === "NotAllowedError") setPaused(true);
      });
    } else {
      el.pause?.();
    }
  }, [inView, paused, setPaused]);

  return (
    <>
      <video
        ref={videoRef}
        data-testid="join-clip"
        data-group={group}
        className="h-full w-full object-cover"
        src={`${MEDIA_DIR}/clip-${group}.mp4`}
        poster={`${MEDIA_DIR}/clip-${group}-poster.webp`}
        aria-label={alt}
        muted
        loop
        playsInline
        preload="none"
      />
      <button
        type="button"
        data-testid="join-clip-toggle"
        aria-label={paused ? labels.play : labels.pause}
        aria-pressed={paused}
        onClick={(event) => {
          event.stopPropagation();
          setPaused((v) => !v);
        }}
        className="absolute bottom-2 end-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {paused ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
      </button>
    </>
  );
}

/** One media slot (card or stage). The clip when this slot is the live one, else the poster. */
function GroupMedia({ group, live, alt, labels, paused, setPaused, sizes }) {
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden bg-border">
      {live ? (
        <GroupClip key={group} group={group} alt={alt} labels={labels} paused={paused} setPaused={setPaused} />
      ) : (
        <NextImage
          src={`${MEDIA_DIR}/clip-${group}-poster.webp`}
          alt={alt}
          width={CLIP_WIDTH}
          height={CLIP_HEIGHT}
          sizes={sizes}
          className="h-full w-full object-cover"
        />
      )}
      <SampleLabel text={labels.sample} />
    </div>
  );
}

function GroupCard({ group, selected, index, onSelect, copy, media }) {
  const Icon = GROUP_ICONS[group];
  return (
    // The whole card is a tap target on phone; the header <button> is the
    // accessible control (role, name, aria-pressed), so the div click is a
    // mouse/touch convenience only.
    <div
      data-testid="join-group-card"
      data-group={group}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelect(group, index)}
      className="w-[78%] shrink-0 snap-center overflow-hidden rounded-md border border-border bg-surface-card min-[700px]:w-auto"
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-controls="join-panel"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(group, index);
        }}
        className={`flex w-full items-center gap-3 px-3 py-3 text-start transition-colors duration-[220ms] ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${
          selected ? "bg-state-selected text-background" : "bg-surface-card text-text"
        }`}
      >
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-[220ms] ease-out motion-reduce:transition-none ${
            selected ? "bg-background/[0.12] text-gold-on-dark" : "bg-green-50 text-primary"
          }`}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="font-semibold leading-tight">{copy.title}</span>
      </button>
      {/* Phone only: media + caption + "more" line. Desktop keeps the list compact. */}
      <div className="min-[700px]:hidden">
        {media}
        <div className="px-3 py-3">
          <p className="text-sm leading-relaxed text-text/85">{copy.line}</p>
          <p className="mt-2 text-sm font-medium text-primary">{selected ? copy.hint : copy.more}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({ group, features, entered, shiftClass, t, tw }) {
  const tiles = features.filter((f) => f.tile);
  const rest = features.filter((f) => !f.tile);
  // At rest a row carries NO transform class. `translate-x-0` still emits a
  // `transform`, and any transform makes the row a stacking context — which
  // traps an open toggletip's z-10 inside its own row and lets the NEXT row
  // paint over it (seen at 390px before this fix).
  const motion = (i) => ({
    className: `transition-[opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
      entered ? "opacity-100" : `${shiftClass} opacity-0`
    }`,
    style: { transitionDelay: entered ? `${i * STAGGER_MS}ms` : "0ms" },
  });
  return (
    <div id="join-panel" data-testid="join-panel" data-group={group}>
      <h3 className="font-headline-md text-xl font-bold text-text">{t(`groups.${group}.label`)}</h3>
      <p className="mt-1 leading-relaxed text-text/85">{t(`groups.${group}.lead`)}</p>
      <ul className="mt-5 grid grid-cols-2 gap-3 min-[700px]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {tiles.map((feature, i) => {
          const Icon = TILE_ICONS[feature.tile.icon];
          const m = motion(i);
          return (
            <li
              key={feature.id}
              data-testid="join-tile"
              data-feature={feature.id}
              className={`min-w-0 rounded-md border border-border bg-surface-card p-3 ${m.className}`}
              style={m.style}
            >
              {Icon ? <Icon size={24} className="text-primary" aria-hidden="true" /> : null}
              <p className="mt-2 font-semibold leading-tight text-text">{t(`items.${feature.id}.tile_title`)}</p>
              <p className="mt-1 text-sm leading-snug text-fg-muted">{t(`items.${feature.id}.tile_line`)}</p>
            </li>
          );
        })}
      </ul>
      <ul className="mt-5 space-y-2.5">
        {rest.map((feature, i) => {
          const m = motion(tiles.length + i);
          return (
            <li
              key={feature.id}
              data-testid="join-check-item"
              data-feature={feature.id}
              className={`relative flex items-start gap-2 leading-relaxed text-text ${m.className}`}
              style={m.style}
            >
              <Check size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span id={`join-item-${feature.id}`}>{t(`items.${feature.id}.label`)}</span>
                {feature.tip ? (
                  <FeatureTip
                    label={tw("trigger")}
                    text={t(`items.${feature.id}.tip`)}
                    describedBy={`join-item-${feature.id}`}
                  />
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Centre `card` in the shelf (RTL-safe: scrollBy is physical in both directions). */
function scrollShelfTo(shelf, card, behavior) {
  if (!shelf || !card) return;
  const shelfBox = shelf.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const delta = cardBox.left + cardBox.width / 2 - (shelfBox.left + shelfBox.width / 2);
  shelf.scrollBy?.({ left: delta, behavior });
}

export default function JoinFeatures() {
  const t = useTranslations("business_features");
  const tj = useTranslations("join.features");
  const tw = useTranslations("whats_this");
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY) === true;

  const [selected, setSelected] = useState(BUSINESS_FEATURE_GROUPS[0]);
  const [shiftClass, setShiftClass] = useState(PANEL_SHIFT_CLASS.forward);
  const [entered, setEntered] = useState(true);
  const [clipPaused, setClipPaused] = useState(false);
  // Reduced motion → clips start paused. The query resolves after mount
  // (useMediaQuery is null on the server), so this follows it once.
  useEffect(() => {
    if (reducedMotion) setClipPaused(true);
  }, [reducedMotion]);
  const indexRef = useRef(0);
  const shelfRef = useRef(null);
  const stageRef = useRef(null);
  const panelRef = useRef(null);

  const byGroup = useMemo(() => {
    const visible = visibleBusinessFeatures();
    return Object.fromEntries(
      BUSINESS_FEATURE_GROUPS.map((g) => [g, visible.filter((f) => f.group === g)]),
    );
  }, []);
  const count = countVisibleBusinessFeatures();
  const cardLine = (g) =>
    g === "return" && !rescueBagsEnabled() ? t("groups.return.card_line_no_rescue") : t(`groups.${g}.card_line`);
  const labels = { pause: tj("pause"), play: tj("play"), sample: tj("sample_label") };

  const select = useCallback(
    (group, index) => {
      if (group === selected) return;
      setShiftClass(index > indexRef.current ? PANEL_SHIFT_CLASS.forward : PANEL_SHIFT_CLASS.back);
      indexRef.current = index;
      setEntered(false);
      setSelected(group);
      const behavior = reducedMotion ? "auto" : "smooth";
      if (isDesktop) {
        const top = stageRef.current?.getBoundingClientRect().top ?? 0;
        if (top < 0) window.scrollBy({ top: top - HEADER_CLEARANCE_PX, behavior });
        return;
      }
      const card = shelfRef.current?.querySelector(`[data-testid="join-group-card"][data-group="${group}"]`);
      scrollShelfTo(shelfRef.current, card, behavior);
      panelRef.current?.scrollIntoView?.({ block: "nearest", behavior });
    },
    [selected, isDesktop, reducedMotion],
  );

  // Two frames: paint the shifted/transparent start state, then transition in.
  useEffect(() => {
    if (entered) return undefined;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [entered]);

  const mediaFor = (group, slot) => (
    <GroupMedia
      group={group}
      live={group === selected && isDesktop !== null && (slot === "stage") === isDesktop}
      alt={tj(`media_alt.${group}`)}
      labels={labels}
      paused={clipPaused}
      setPaused={setClipPaused}
      sizes={slot === "stage" ? "480px" : "78vw"}
    />
  );

  return (
    <section data-testid="join-features" className="bg-background-alt py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="mb-2 text-center text-sm font-medium text-fg-muted">{tj("eyebrow")}</p>
        <h2 className="mb-3 text-center font-headline-lg text-[clamp(26px,3.5vw,38px)] font-bold text-text">
          {tj("heading")}
        </h2>
        <p data-testid="join-features-count" className="mb-10 text-center text-text/85">
          {t("total_line", { count })}
        </p>

        <div className="min-[700px]:grid min-[700px]:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] min-[700px]:items-start min-[700px]:gap-8">
          <div className="min-w-0 min-[700px]:sticky min-[700px]:top-24">
            <div
              ref={shelfRef}
              role="group"
              aria-label={tj("shelf_aria")}
              data-testid="join-shelf"
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 min-[700px]:flex-col min-[700px]:overflow-visible min-[700px]:pb-0"
            >
              {BUSINESS_FEATURE_GROUPS.map((group, index) => (
                <GroupCard
                  key={group}
                  group={group}
                  index={index}
                  selected={group === selected}
                  onSelect={select}
                  copy={{
                    title: t(`groups.${group}.card_title`),
                    line: cardLine(group),
                    hint: tj("panel_hint"),
                    more: tj("more", { n: byGroup[group].length }),
                  }}
                  media={mediaFor(group, "card")}
                />
              ))}
            </div>
            <div aria-hidden="true" className="mt-3 flex justify-center gap-1.5 min-[700px]:hidden">
              {BUSINESS_FEATURE_GROUPS.map((group) => (
                <span
                  key={group}
                  className={`h-1.5 w-1.5 rounded-full ${group === selected ? "bg-primary" : "bg-primary/25"}`}
                />
              ))}
            </div>
          </div>

          <div ref={stageRef} className="mt-8 min-w-0 min-[700px]:mt-0">
            <div className="mb-6 hidden max-w-[480px] overflow-hidden rounded-md border border-border min-[700px]:block">
              {mediaFor(selected, "stage")}
            </div>
            {/* scroll-mt: the sticky site header is ~96px; without it the panel
                heading lands under the header when the panel scrolls into view. */}
            <div ref={panelRef} className="scroll-mt-24">
              <Panel
                group={selected}
                features={byGroup[selected]}
                entered={entered}
                shiftClass={shiftClass}
                t={t}
                tw={tw}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
