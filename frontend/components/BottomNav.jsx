"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const publishHref = user?.role === "producer" ? "/producer/me" : "/register/producer";

  const tabs = [
    { href: "/", icon: "🔍", label: "גלה", match: (p) => p === "/" || p === "/map" },
    { href: publishHref, icon: "➕", label: "פרסם", match: (p) => p.startsWith("/register/producer") || p.startsWith("/producer/me") },
    { href: "/favorites", icon: "❤️", label: "מועדפים", match: (p) => p === "/favorites" },
    { href: "/messages", icon: "💬", label: "הודעות", match: (p) => p === "/messages" },
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
                  active ? "text-primary" : "text-text-secondary"
                }`}
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
