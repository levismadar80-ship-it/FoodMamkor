"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MapTrifold, CookingPot, UserCircle } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import OnboardingTip from "@/components/OnboardingTip";
import { useOnboarding } from "@/lib/use-onboarding";

/**
 * Mobile bottom nav (MEH-20 redesign) — 4 tabs.
 *
 * Trimmed from 5 → 4:
 *   - אירועים removed (events now live inside producer detail pages)
 *   - מועדפים removed from the bottom nav (still reachable via the
 *     hamburger drawer + /favorites route)
 *   - פרופיל added — routes to /settings when logged in, /login when
 *     guest (explicit "log in" CTA avoids a redirect loop for guests
 *     who tap the tab while logged out)
 *
 * grid-cols-4 makes each tab ~25 % wide with legible icon+label.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { step: onboardStep, advance: onboardAdvance, dismiss: onboardDismiss } = useOnboarding();

  // Smart auth slot: guest→/login, consumer→/settings, producer→/producer/dashboard.
  const isProducer = user?.role === "producer";
  const hasAvatar = !!user?.avatar_url;
  const initial = user ? (user.name || "?").trim().charAt(0).toUpperCase() : null;
  const profileHref = user
    ? isProducer ? "/producer/dashboard" : "/settings"
    : "/login";

  const tabs = [
    { href: "/", Icon: House, labelKey: "nav_discover", match: (p) => p === "/" },
    { href: "/map", Icon: MapTrifold, labelKey: "nav_map", match: (p) => p === "/map" },
    { href: "/neighbor", Icon: CookingPot, labelKey: "nav_neighbor", match: (p) => p.startsWith("/neighbor") },
    {
      href: profileHref,
      Icon: UserCircle,
      labelKey: "nav_profile",
      match: (p) =>
        p.startsWith("/settings") || p === "/login" || p.startsWith("/producer/dashboard"),
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("nav_mobile_label")}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab, idx) => {
          const active = tab.match(pathname || "/");
          const Icon = tab.Icon;
          // Step 2 = map tab (idx 1); step 3 = profile tab (idx 3).
          const isMapTab = idx === 1;
          const isProfileTab = idx === 3;
          const showStep2 = isMapTab && onboardStep === 2;
          const showStep3 = isProfileTab && onboardStep === 3;

          return (
            <li key={tab.labelKey} className="relative">
              {showStep2 && (
                <OnboardingTip
                  show
                  text="מפה אינטראקטיבית — גלי בתי עסק קרובים אלייך 🗺️"
                  onDismiss={onboardDismiss}
                  onNext={onboardAdvance}
                  placement="above"
                />
              )}
              {showStep3 && (
                <OnboardingTip
                  show
                  text="הצטרפי כדי לשמור עסקים מועדפים ולדרג 💚"
                  cta="הבנתי, סיום"
                  onDismiss={onboardDismiss}
                  onNext={onboardDismiss}
                  placement="above"
                />
              )}
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center py-2 min-h-[56px] text-[13px] transition ${
                  active ? "text-primary" : "text-site-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {/* Profile tab: show avatar when logged in, UserCircle when guest */}
                {isProfileTab && user ? (
                  <span
                    className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: hasAvatar ? "transparent" : "#2e6853" }}
                  >
                    {hasAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-semibold leading-none">{initial}</span>
                    )}
                  </span>
                ) : (
                  <Icon size={22} weight={active ? "fill" : "duotone"} />
                )}
                <span className="mt-1">{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
