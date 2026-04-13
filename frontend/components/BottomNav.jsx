"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MapTrifold, CalendarBlank, CookingPot, Heart } from "@phosphor-icons/react";
import { useLanguage } from "@/lib/language-context";

/**
 * Mobile bottom nav — 5 tabs. Went from 4 to 5 when /neighbor got its
 * own page (previously the home-kitchen section lived on the homepage).
 * grid-cols-5 makes each tab ~20% wide; icons and labels stay legible.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const tabs = [
    { href: "/", Icon: House, labelKey: "nav_discover", match: (p) => p === "/" },
    { href: "/map", Icon: MapTrifold, labelKey: "nav_map", match: (p) => p === "/map" },
    { href: "/events", Icon: CalendarBlank, labelKey: "nav_events", match: (p) => p.startsWith("/events") },
    { href: "/neighbor", Icon: CookingPot, labelKey: "nav_neighbor", match: (p) => p.startsWith("/neighbor") },
    { href: "/favorites", Icon: Heart, labelKey: "nav_favorites", match: (p) => p === "/favorites" },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      aria-label={t("nav_mobile_label")}
    >
      <ul className="grid grid-cols-5">
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
