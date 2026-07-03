"use client";

import Link from "next/link";
// MEH-731: locale-stripping usePathname (returns "/" on /he and /en) so the
// home-tab match fires on the localized homepage. next/navigation's is
// locale-prefixed (/he) and left the home tab permanently unhighlighted.
import { usePathname } from "@/i18n/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Compass, MapTrifold, Flower, User } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";
import OnboardingTip from "@/components/OnboardingTip";
import { useOnboarding } from "@/lib/use-onboarding";
import AccountSheet from "@/components/AccountSheet";

/**
 * Mobile bottom nav — MEH-789 (Phase 6 "Cream Signature" port).
 *
 * Replaces the MEH-20 full-width bottom bar with the signature floating cream
 * pill: 4 DESTINATIONS (גלו · מפה · אודות · חשבון), zero actions. MEH-843:
 * the per-tab solid-green highlight became a green-tint indicator across the 3
 * route tabs + Phosphor fill-on-active + 10.5px DM Sans labels. MEH-852: the
 * indicator is now a SINGLE nav-level capsule that measures the active tab's
 * rect and animates left+width with a DIRECTIONAL liquid-stretch (leading edge
 * springs snappier than width → it elongates along the travel path, then
 * settles; per ADR-023). The active dot was removed — tint + green ink + filled
 * icon already identify the active tab. The account tab mirrors the same quiet
 * tint statically (not on the indicator track — it isn't a route).
 *
 * The account tab is NOT a route — it toggles the warm-dark AccountSheet
 * (favorites / settings / language / logout + the quiet "יש לך בית עסק?"
 * entry, MEH-669-gated). Avatar replaces the icon when logged in. md:hidden —
 * desktop keeps the single refined top bar (no bottom nav).
 *
 * Transitional: the legacy hamburger drawer still lives in Header.jsx until
 * the Header minimal-top PR (MEH-789 PR-B), so secondary items are briefly
 * reachable from both. MEH-1014: the pill no longer hides on scroll — it
 * MINIMIZES (labels collapse, icons stay, height 56→48px) and never leaves the
 * screen. rAF + asymmetric hysteresis (down 24px → compact, up 8px → expand) +
 * a scroll clamp kill the iOS rubber-band flicker the old hide-on-scroll had.
 */
// MEH-1014: tunable minimize thresholds (Sapir may tune after QA).
const HIDE_DELTA = 24; // accumulated downward px before compacting
const REVEAL_DELTA = 8; // accumulated upward px before expanding
const TOP_THRESHOLD = 60; // scrollY under this → always expanded

export default function BottomNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useTranslations();
  const { step: onboardStep, advance: onboardAdvance, dismiss: onboardDismiss } = useOnboarding();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Stable identity so AccountSheet's focus effect (deps [open, onClose]) runs
  // only on open-state transitions — an inline arrow would re-fire it on every
  // re-render while the sheet is open and bounce keyboard focus.
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // MEH-1014: minimize-on-scroll-down / expand-on-scroll-up for the floating
  // pill. `compact` collapses labels + shrinks height; the pill never slides
  // off. rAF/last-Y refs mirror Header.jsx:57-64; the two accumulator refs
  // hold directional distance for the asymmetric hysteresis.
  const [compact, setCompact] = useState(false);
  const rafRef = useRef(null);
  const lastYRef = useRef(0);
  const downAccRef = useRef(0);
  const upAccRef = useRef(0);

  // MEH-1014: rAF-throttled scroll listener. Still mirrored inline from
  // Header.jsx:91-116 (MEH-29/734) — intentional copy, a shared hook
  // extraction is a separate ticket; do NOT DRY this against Header here.
  // Clamp kills iOS rubber-band overscroll (negative y / y past the max
  // producing phantom deltas); asymmetric accumulators give minimize a
  // longer runway (24px) than expand (8px) so it settles instead of
  // flickering. Sheet-open guard is applied at render (compact && !sheetOpen),
  // so this listener stays pure and stable ([] deps).
  useEffect(() => {
    const clampY = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(window.scrollY, max));
    };
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        const y = clampY();
        const dy = y - lastYRef.current;
        if (y < TOP_THRESHOLD) {
          // Near the top → always expanded; reset both accumulators.
          downAccRef.current = 0;
          upAccRef.current = 0;
          setCompact(false);
        } else if (dy > 0) {
          // Downward: a direction change resets the opposite (up) accumulator.
          upAccRef.current = 0;
          downAccRef.current += dy;
          if (downAccRef.current >= HIDE_DELTA) setCompact(true);
        } else if (dy < 0) {
          // Upward: a direction change resets the opposite (down) accumulator.
          downAccRef.current = 0;
          upAccRef.current += -dy;
          if (upAccRef.current >= REVEAL_DELTA) setCompact(false);
        }
        lastYRef.current = y;
        rafRef.current = null;
      });
    };
    // Seed last-Y with the restored (clamped) offset so a reload / back-forward
    // at a scrolled position isn't read as a downward delta (mirrors MEH-734).
    lastYRef.current = clampY();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // MEH-1014: focus within the nav forces expansion (mirrors the MEH-734
  // focus guard removed from Header in MEH-884) so keyboard/AT users never
  // land on a collapsed label. Reset the down accumulator so the next small
  // scroll-down doesn't immediately re-compact under their focus.
  const expandOnFocus = useCallback(() => {
    downAccRef.current = 0;
    setCompact(false);
  }, []);

  // MEH-669: hide the business entry from producers + admins (defense-in-depth;
  // auth.py:432 is the server authority). Threaded into the sheet as showBiz.
  const isProducer = user?.role === "producer";
  const isAdmin = user?.role === "admin";
  const showAddBusinessCta = !isProducer && !isAdmin;
  const hasAvatar = !!user?.avatar_url;
  const initial = user ? (user.name || "?").trim().charAt(0).toUpperCase() : null;

  const isActive = (href) =>
    href === "/" ? (pathname || "/") === "/" : (pathname || "").startsWith(href);

  // 3 destination links + the account tab (rendered separately — it toggles
  // the sheet instead of navigating).
  const destinations = [
    { id: "discover", href: "/", Icon: Compass, label: t("nav.discover") },
    { id: "map", href: "/map", Icon: MapTrifold, label: t("nav.map") },
    { id: "about", href: "/about", Icon: Flower, label: t("nav.about") },
  ];

  // MEH-852: single directional liquid-stretch indicator. A nav-level capsule
  // (not a per-tab layoutId) measures the ACTIVE route tab's rect and animates
  // left+width — the leading edge springs snappier than width, so it elongates
  // along the travel path then contracts (ADR-023). RTL-safe: offsetLeft/Width
  // are real measured rects, direction-agnostic. Re-measures on resize.
  const navRef = useRef(null);
  const tabRefs = useRef([]);
  const [indicator, setIndicator] = useState(null);
  const activeRouteIndex = destinations.findIndex((d) => isActive(d.href));
  useEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeRouteIndex];
      const nav = navRef.current;
      if (!el || !nav) return setIndicator(null);
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [activeRouteIndex]);

  // MEH-1014: the sheet always renders the pill expanded (it must sit above its
  // own sheet at full size), so the render-time compact flag folds in sheetOpen.
  const isCompact = compact && !sheetOpen;

  // Active = green ink (text-primary) over the shared tint indicator; idle =
  // muted. `relative` keeps icon/label (z-10) above the z-0 capsule. MEH-1014:
  // the tap target relaxes from 44→40px min-height in compact mode.
  const tabCls = (active) =>
    [
      "relative w-full min-w-[64px] flex flex-col items-center justify-center gap-[4px]",
      isCompact ? "min-h-[40px]" : "min-h-[44px]",
      "rounded-full px-1 py-1.5 transition-colors duration-fast ease-quart motion-reduce:transition-none focus-ring",
      // MEH-919: inactive label darkened from fg-muted (#5c584f → 3.53 on the
      // sage nav capsule) to #4b4841 (4.55) for WCAG AA; active stays text-primary.
      active ? "text-primary" : "text-[#4b4841]",
    ].join(" ");
  // z-10 lifts icon + label above the z-0 tint capsule.
  const labelCls = "relative z-10 font-body text-[10.5px] font-semibold leading-none";
  // MEH-1014: label collapse wrapper. overflow-hidden clips the text as
  // max-height animates to 0; opacity fades it in tandem. Only height/opacity/
  // max-height transition — the pill's backdrop-filter (nav-pill-glass) is
  // never animated. motion-reduce → instant.
  const labelWrapCls = [
    "relative z-10 block overflow-hidden text-center",
    "transition-[opacity,max-height] duration-base ease-quart motion-reduce:transition-none",
    isCompact ? "opacity-0 max-h-0" : "opacity-100 max-h-4",
  ].join(" ");

  // Static tint capsule for the account tab (not on the route track — the route
  // tabs share the single MEH-852 liquid-stretch indicator instead).
  const capsuleCls = "absolute inset-0 rounded-full bg-primary/10 z-0 pointer-events-none";

  return (
    <>
      {/* Floating shell — full-width row with ~14px side gutters (px) + a
          safe-area-inset + 16px bottom gutter; holds the wide pill. */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-[1000] flex justify-center px-[14px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        // MEH-1014: any focus landing inside the pill forces it back to full
        // size (mirror of the MEH-734 focus guard). onFocusCapture catches it
        // on the way down before the focused control is a collapsed label.
        onFocusCapture={expandOnFocus}
      >
        {/* MEH-789 (chunk 3): frosted warm-glass surface (.nav-pill-glass in
            globals.css) replaces the opaque bg-background + border; shadow kept.
            backdrop-filter is never animated — MEH-1014 minimize transitions
            height only. MEH-852 size tune: wide pill (w-full, ~14px side margins
            from the shell px); rounded-full = radius height/2. Tabs flex-1.
            MEH-1014: h-14→h-12 (56→48px) + p-1.5→p-1 when compact; only height
            transitions (padding + labels handled separately). */}
        <nav
          ref={navRef}
          aria-label={t("nav.mobile_label")}
          className={[
            "relative w-full flex items-stretch justify-between gap-1 rounded-full nav-pill-glass shadow-[0_8px_30px_rgba(46,104,83,0.12)]",
            "transition-[height] duration-base ease-quart motion-reduce:transition-none",
            isCompact ? "h-12 p-1" : "h-14 p-1.5",
          ].join(" ")}
        >
          {/* MEH-852: single directional liquid-stretch indicator for the active
              route tab (replaces the per-tab layoutId capsule). Leading edge
              (left) springs snappier than width → elongates along travel, then
              settles. prefers-reduced-motion → instant (MotionConfig, layout.js).
              rtl-ok: left/width are measured real rects (offsetLeft/offsetWidth),
              direction-agnostic — not physical Tailwind classes. */}
          {indicator && (
            <motion.div
              aria-hidden="true"
              className="absolute top-1.5 bottom-1.5 rounded-full bg-primary/10 z-0 pointer-events-none"
              initial={false}
              animate={{ left: indicator.left, width: indicator.width }}
              transition={{
                left: { type: "spring", stiffness: 700, damping: 34, mass: 1 },
                width: { type: "spring", stiffness: 320, damping: 30, mass: 1 },
              }}
            />
          )}
          {destinations.map((tab, idx) => {
            const active = isActive(tab.href);
            const Icon = tab.Icon;
            // Onboarding step 2 → map tab (idx 1).
            const showStep2 = idx === 1 && onboardStep === 2;
            return (
              <div
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                className="relative flex-1 flex"
              >
                {showStep2 && (
                  <OnboardingTip
                    show
                    text={t("nav.onboarding.map")}
                    onDismiss={onboardDismiss}
                    onNext={onboardAdvance}
                    placement="above"
                  />
                )}
                <Link
                  href={tab.href}
                  className={tabCls(active)}
                  aria-current={active ? "page" : undefined}
                >
                  {/* MEH-852: the active tint is the shared nav-level indicator
                      above — no per-tab capsule here anymore. */}
                  <Icon
                    size={22}
                    weight={active ? "fill" : "regular"}
                    aria-hidden="true"
                    className="relative z-10"
                  />
                  <span className={labelWrapCls}>
                    <span className={labelCls}>{tab.label}</span>
                  </span>
                </Link>
              </div>
            );
          })}

          {/* Account — toggles the sheet (not a route). Avatar when logged in. */}
          <div className="relative flex-1 flex">
            {/* Onboarding step 3 → account tab. */}
            {onboardStep === 3 && (
              <OnboardingTip
                show
                text={t("nav.onboarding.profile")}
                cta={t("nav.onboarding.profile_cta")}
                onDismiss={onboardDismiss}
                onNext={onboardDismiss}
                placement="above"
              />
            )}
            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-label={user ? t("account.menu.aria", { name: user.name }) : t("nav.account")}
              className={tabCls(sheetOpen)}
            >
              {/* MEH-843: same quiet tint as the route tabs, but static — the
                  account tab is a sheet toggle, not a route, so no layoutId. */}
              {sheetOpen && <span className={capsuleCls} aria-hidden="true" />}
              {user ? (
                // Avatar: green token circle + white initial (MEH-20 treatment,
                // old raw-hex green → bg-primary token); image when one is set.
                <span className="relative z-10 w-6 h-6 rounded-full overflow-hidden inline-flex items-center justify-center bg-primary">
                  {hasAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-[12px] font-semibold leading-none">{initial}</span>
                  )}
                </span>
              ) : (
                <User
                  size={22}
                  weight={sheetOpen ? "fill" : "regular"}
                  aria-hidden="true"
                  className="relative z-10"
                />
              )}
              <span className={labelWrapCls}>
                <span className={labelCls}>{t("nav.account")}</span>
              </span>
            </button>
          </div>
        </nav>
      </div>

      <AccountSheet
        open={sheetOpen}
        onClose={closeSheet}
        user={user}
        logout={logout}
        showBiz={showAddBusinessCta}
      />
    </>
  );
}
