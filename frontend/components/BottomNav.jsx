"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", icon: "🏠", label: "גלה", match: (p) => p === "/" },
    { href: "/map", icon: "🗺️", label: "מפה", match: (p) => p === "/map" },
    { href: "/events", icon: "📅", label: "אירועים", match: (p) => p.startsWith("/events") },
    { href: "/favorites", icon: "❤️", label: "מועדפים", match: (p) => p === "/favorites" },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      aria-label="ניווט מובייל"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.match(pathname || "/");
          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center py-2 text-xs transition ${
                  active ? "text-primary" : "text-site-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className="text-xl leading-none" aria-hidden>{tab.icon}</span>
                <span className="mt-1">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
