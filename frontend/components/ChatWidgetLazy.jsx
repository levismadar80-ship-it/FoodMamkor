"use client";

import dynamic from "next/dynamic";
// Locale-stripping usePathname — returns "/map" for /he/map AND /en/map
// (same import BottomNav.jsx:7 uses for its route-awareness).
import { usePathname } from "@/i18n/navigation";
// MEH-1202: isProducerDetail moved to a shared helper so BottomNav's new gate
// and this FAB gate share one owner (no keep-in-sync drift).
import { isProducerDetail } from "@/lib/producer-route";

// Client boundary so `ssr: false` is valid: the root layout is a Server
// Component (it exports generateMetadata), where next/dynamic ssr:false is
// disallowed. Defers the interaction-gated widget to a post-hydration chunk
// (it renders nothing until opened, so no SSR content is lost).
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), {
  ssr: false,
});

// MEH-2512: form pages whose primary control sits under the mobile launcher.
// Exact path or a subpath ("/register/producer"), never a shared prefix.
// MEH-2602: the owner dashboard joins — at 375 the launcher sat over the
// availability chips on the overview and over fields on the edit pages
// (staging sweep 29/10). Mobile only; desktop keeps it, as for every form.
const FORM_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password", "/contact", "/producer/dashboard"];

// MEH-1168 P3: the global chat FAB is suppressed on the public producer detail
// page (/producer/[id]) ONLY — that page already carries a primary contact CTA
// + a sticky contact bar, so the FAB was a second green action that overlapped
// the contact card at 375px. The widget stays mounted everywhere else (this is
// a conditional render by route, NOT a global removal). usePathname comes from
// @/i18n/navigation, so it is locale-stripped ("/producer/123", not "/he/...").
// The dashboard subtree (/producer/dashboard/...) keeps the FAB on desktop
// (MEH-2602: hidden on phones, via FORM_ROUTES).
// MEH-1203: /favorites joins /map + /producer/[id] in the gate — the FAB
// overlapped the first card of the canonical 2-col favorites grid.
export default function ChatWidgetLazy() {
  const pathname = usePathname();
  // /map is the second page where the FAB does damage instead of good: the
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
  if (isProducerDetail(pathname)) return null;
  // MEH-1203: /favorites is the third page where the FAB does damage — at the
  // canonical 2-col grid the launcher's bottom-END corner (insetInlineEnd,
  // z-9999) sits over the first card. Same pathname-gate pattern as /map and
  // /producer/[id] above; the widget stays mounted everywhere else.
  if (pathname === "/favorites") return null;
  // MEH-2359: the consumer chat FAB has no job on the admin backoffice and
  // its bottom-END corner sat over the row-action column of the approvals
  // table. Same pathname gate as above.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  // MEH-2512: on phones the launcher's bottom-END corner sat over the primary
  // control of every form page (login submit, register preflight, password
  // field, contact input). No floating launcher over a form — mobile only; on
  // desktop it sits in the page corner, clear of the centred form.
  const isFormPage = FORM_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  return <ChatWidget hideOnMobile={isFormPage} />;
}
