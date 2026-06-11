"use client";

import Link from "next/link";
// MEH-731: locale-stripping usePathname (returns "/" on /he and /en) so the
// home-tab match fires on the localized homepage. next/navigation's is
// locale-prefixed (/he) and left the home tab permanently unhighlighted.
import { usePathname } from "@/i18n/navigation";
import { useCallback, useState } from "react";
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
 * pill: 4 DESTINATIONS (גלו · מפה · אודות · חשבון), zero actions. Pill-in-pill
 * green active highlight + Phosphor fill-on-active + 11px DM Sans labels.
 *
 * The account tab is NOT a route — it toggles the warm-dark AccountSheet
 * (favorites / settings / language / logout + the quiet "יש לך בית עסק?"
 * entry, MEH-669-gated). Avatar replaces the icon when logged in. md:hidden —
 * desktop keeps the single refined top bar (no bottom nav).
 *
 * Transitional: the legacy hamburger drawer still lives in Header.jsx until
 * the Header minimal-top PR (MEH-789 PR-B), so secondary items are briefly
 * reachable from both. Bottom-pill hide-on-scroll (reuse MEH-734) is deferred
 * to a follow-up — this PR is the visual/structural port.
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

  // pill-in-pill: green fill + cream content on active, muted ink idle.
  const tabCls = (active) =>
    [
      "w-full min-w-[64px] min-h-[56px] flex flex-col items-center justify-center gap-[3px]",
      "rounded-full px-1 py-1.5 transition-colors duration-fast ease-quart motion-reduce:transition-none focus-ring",
      active ? "bg-primary text-background" : "text-fg-muted",
    ].join(" ");
  const labelCls = "font-body text-[11px] font-medium leading-none";

  return (
    <>
      {/* Floating shell — centers the pill, reserves safe-area + 16px gutter. */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-[1000] flex justify-center px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <nav
          aria-label={t("nav.mobile_label")}
          className="w-full max-w-[343px] flex items-stretch justify-between gap-1 p-1.5 rounded-full bg-background border border-border shadow-[0_8px_30px_rgba(46,104,83,0.12)]"
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
                  <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />
                  <span className={labelCls}>{tab.label}</span>
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
              {user ? (
                // Avatar: green token circle + white initial (MEH-20 treatment,
                // old raw-hex green → bg-primary token); image when one is set.
                <span className="w-6 h-6 rounded-full overflow-hidden inline-flex items-center justify-center bg-primary">
                  {hasAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-[12px] font-semibold leading-none">{initial}</span>
                  )}
                </span>
              ) : (
                <User size={22} weight={sheetOpen ? "fill" : "regular"} aria-hidden="true" />
              )}
              <span className={labelCls}>{t("nav.account")}</span>
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
