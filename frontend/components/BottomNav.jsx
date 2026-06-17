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
 * the per-tab solid-green highlight became a sliding green-tint indicator
 * (framer shared-layout, layoutId="navIndicator" across the 3 route tabs only)
 * + Phosphor fill-on-active + a 4px dot + 11px DM Sans labels. The account tab
 * mirrors the same quiet tint statically (no layoutId — it isn't a route).
 *
 * The account tab is NOT a route — it toggles the warm-dark AccountSheet
 * (favorites / settings / language / logout + the quiet "יש לך בית עסק?"
 * entry, MEH-669-gated). Avatar replaces the icon when logged in. md:hidden —
 * desktop keeps the single refined top bar (no bottom nav).
 *
 * Transitional: the legacy hamburger drawer still lives in Header.jsx until
 * the Header minimal-top PR (MEH-789 PR-B), so secondary items are briefly
 * reachable from both. MEH-789 (chunk 2): the pill hides on scroll-down /
 * reveals on scroll-up (rAF + 60px threshold, mirrored inline from
 * Header.jsx:91-116), staying visible while the account sheet is open.
 */
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

  // MEH-789 (chunk 2): hide-on-scroll-down / reveal-on-scroll-up for the
  // floating pill. State + rAF/last-Y refs mirror Header.jsx:57-64.
  const [hidden, setHidden] = useState(false);
  const rafRef = useRef(null);
  const lastYRef = useRef(0);

  // MEH-789 (chunk 2): rAF-throttled scroll listener mirrored inline from
  // Header.jsx:91-116 (MEH-29/734). Intentional copy — a shared hook
  // extraction is a separate ticket; do NOT DRY this against Header here.
  // Down past the 60px threshold hides the pill; any scroll up — or being
  // near the top — reveals. The sheet-open guard is applied at render
  // (hidden && !sheetOpen), so this listener stays pure and stable ([] deps).
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 60) setHidden(false);
        else if (y > lastYRef.current) setHidden(true);
        else if (y < lastYRef.current) setHidden(false);
        lastYRef.current = y;
        rafRef.current = null;
      });
    };
    // Seed last-Y with the restored offset so a reload / back-forward at a
    // scrolled position isn't read as a downward delta (mirrors MEH-734).
    lastYRef.current = window.scrollY;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
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

  // MEH-843: positioning context (`relative`) for the absolute tint capsule +
  // dot. Active = green ink over the quiet bg-primary/10 capsule; idle = muted.
  const tabCls = (active) =>
    [
      "relative w-full min-w-[64px] min-h-[56px] flex flex-col items-center justify-center gap-[3px]",
      "rounded-full px-1 py-1.5 transition-colors duration-fast ease-quart motion-reduce:transition-none focus-ring",
      active ? "text-primary" : "text-fg-muted",
    ].join(" ");
  // z-10 lifts icon + label above the z-0 tint capsule.
  const labelCls = "relative z-10 font-body text-[11px] font-medium leading-none";

  // MEH-843: 4px active dot, absolute bottom-center so it adds zero layout shift
  // between active (with dot) and idle (without) tabs.
  // rtl-ok: left-1/2 -translate-x-1/2 = direction-neutral horizontal-center idiom.
  const dotCls = "absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary z-10 pointer-events-none";
  const dot = <span aria-hidden="true" className={dotCls} />;
  // Static tint capsule for the account tab (no layoutId — not on the route track).
  const capsuleCls = "absolute inset-0 rounded-full bg-primary/10 z-0 pointer-events-none";

  return (
    <>
      {/* Floating shell — centers the pill, reserves safe-area + 16px gutter. */}
      <div
        className={[
          "md:hidden fixed bottom-0 inset-x-0 z-[1000] flex justify-center px-4",
          // MEH-789 (chunk 2): transform-only slide, never backdrop-filter.
          // motion-reduce → instant (mirrors Header MEH-734). translate-y is
          // vertical (direction-neutral — no RTL concern); 120% clears the
          // pill + drop-shadow + safe-area inset. Held visible while the sheet
          // is open so the account control never slides off under its own sheet.
          "transition-transform duration-base ease-quart motion-reduce:transition-none",
          hidden && !sheetOpen ? "translate-y-[120%]" : "translate-y-0",
        ].join(" ")}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        {/* MEH-789 (chunk 3): frosted warm-glass surface (.nav-pill-glass in
            globals.css) replaces the opaque bg-background + border; shadow kept.
            backdrop-filter is never animated — the chunk-2 hide is transform-only. */}
        <nav
          aria-label={t("nav.mobile_label")}
          className="w-full max-w-[343px] flex items-stretch justify-between gap-1 p-1.5 rounded-full nav-pill-glass shadow-[0_8px_30px_rgba(46,104,83,0.12)]"
        >
          {destinations.map((tab, idx) => {
            const active = isActive(tab.href);
            const Icon = tab.Icon;
            // Onboarding step 2 → map tab (idx 1).
            const showStep2 = idx === 1 && onboardStep === 2;
            return (
              <div key={tab.id} className="relative flex-1 flex">
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
                  {/* MEH-843: shared-layout indicator — slides between the active
                      route tab via layoutId; reduced-motion handled globally by
                      <MotionConfig reducedMotion="user"> (layout.js). */}
                  {active && (
                    <motion.div
                      layoutId="navIndicator"
                      transition={{ type: "spring", stiffness: 520, damping: 32, mass: 1 }}
                      className={capsuleCls}
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    size={22}
                    weight={active ? "fill" : "regular"}
                    aria-hidden="true"
                    className="relative z-10"
                  />
                  <span className={labelCls}>{tab.label}</span>
                  {active && dot}
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
              <span className={labelCls}>{t("nav.account")}</span>
              {sheetOpen && dot}
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
