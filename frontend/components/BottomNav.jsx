"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MapTrifold, Calendar, CookingPot, Heart } from "@phosphor-icons/react";

/**
 * Mobile bottom nav — 5 tabs. Went from 4 to 5 when /neighbor got its
 * own page (previously the home-kitchen section lived on the homepage).
 * grid-cols-5 makes each tab ~20% wide; icons and labels stay legible.
 */
export default function BottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", Icon: House, label: "גלה", match: (p) => p === "/" },
    { href: "/map", Icon: MapTrifold, label: "מפה", match: (p) => p === "/map" },
    { href: "/events", Icon: Calendar, label: "אירועים", match: (p) => p.startsWith("/events") },
    { href: "/neighbor", Icon: CookingPot, label: "מהשכן", match: (p) => p.startsWith("/neighbor") },
    { href: "/favorites", Icon: Heart, label: "מועדפים", match: (p) => p === "/favorites" },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      aria-label="ניווט מובייל"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.match(pathname || "/");
          const Icon = tab.Icon;
          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center py-2 text-[11px] transition ${
                  active ? "text-primary" : "text-site-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={22} weight={active ? "fill" : "duotone"} />
                <span className="mt-1">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
