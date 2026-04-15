"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MapTrifold, CookingPot, UserCircle } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";

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

  // Profile tab is context-aware: guests → login; logged-in → settings.
  const profileHref = user ? "/settings" : "/login";

  const tabs = [
    { href: "/", Icon: House, labelKey: "nav_discover", match: (p) => p === "/" },
    { href: "/map", Icon: MapTrifold, labelKey: "nav_map", match: (p) => p === "/map" },
    { href: "/neighbor", Icon: CookingPot, labelKey: "nav_neighbor", match: (p) => p.startsWith("/neighbor") },
    {
      href: profileHref,
      Icon: UserCircle,
      labelKey: "nav_profile",
      match: (p) => p.startsWith("/settings") || p === "/login",
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      aria-label={t("nav_mobile_label")}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.match(pathname || "/");
          const Icon = tab.Icon;
          return (
            <li key={tab.labelKey}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center py-2 min-h-[44px] text-[11px] transition ${
                  active ? "text-primary" : "text-site-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={22} weight={active ? "fill" : "duotone"} />
                <span className="mt-1">{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
