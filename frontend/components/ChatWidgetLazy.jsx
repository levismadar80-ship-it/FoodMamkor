"use client";

import dynamic from "next/dynamic";
// Locale-stripping usePathname — returns "/map" for /he/map AND /en/map
// (same import BottomNav.jsx:7 uses for its route-awareness).
import { usePathname } from "@/i18n/navigation";

// Client boundary so `ssr: false` is valid: the root layout is a Server
// Component (it exports generateMetadata), where next/dynamic ssr:false is
// disallowed. Defers the interaction-gated widget to a post-hydration chunk
// (it renders nothing until opened, so no SSR content is lost).
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), {
  ssr: false,
});

export default function ChatWidgetLazy() {
  const pathname = usePathname();
  // /map is the one page where the FAB does damage instead of good: the
  // launcher owns the bottom-END corner at z-9999 (ChatWidget.jsx:178-182,
  // insetInlineEnd — bottom-LEFT in RTL) and sits on top of the desktop
  // category-legend toggle in the same corner at z-[800] (MapPane.jsx:149,
  // absolute bottom-4 "left"-4 — a documented map-overlay physical
  // exception, rtl-ok). Every /map z-index token (rtl.md ledger: tiles 0 →
  // controls 1000) loses to the FAB's 9999, so no reshuffle inside the map
  // can win — the widget simply doesn't render on /map (all locales, mobile
  // + desktop). Industry pattern: Intercom's hide_default_launcher per-page
  // setting. Gated HERE at the lazy wrapper so /map never even downloads the
  // chat chunk; ChatWidget internals and its positioning on every other page
  // are untouched.
  if (pathname === "/map" || pathname.startsWith("/map/")) return null;
  return <ChatWidget />;
}
