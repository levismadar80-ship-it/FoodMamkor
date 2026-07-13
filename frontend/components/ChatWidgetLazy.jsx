"use client";

import dynamic from "next/dynamic";
import { usePathname } from "@/i18n/navigation";

// Client boundary so `ssr: false` is valid: the root layout is a Server
// Component (it exports generateMetadata), where next/dynamic ssr:false is
// disallowed. Defers the interaction-gated widget to a post-hydration chunk
// (it renders nothing until opened, so no SSR content is lost).
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), {
  ssr: false,
});

// MEH-1168 P3: the global chat FAB is suppressed on the public producer detail
// page (/producer/[id]) ONLY — that page already carries a primary contact CTA
// + a sticky contact bar, so the FAB was a second green action that overlapped
// the contact card at 375px. The widget stays mounted everywhere else (this is
// a conditional render by route, NOT a global removal). usePathname comes from
// @/i18n/navigation, so it is locale-stripped ("/producer/123", not "/he/...").
// The dashboard subtree (/producer/dashboard/...) keeps the FAB.
function isProducerDetail(pathname) {
  // `$` anchor: match the /producer/[id] leaf exactly (no public sub-routes),
  // so a hypothetical future nested route wouldn't accidentally lose the FAB.
  return /^\/producer\/(?!dashboard(\/|$))[^/]+$/.test(pathname || "");
}

export default function ChatWidgetLazy() {
  const pathname = usePathname();
  if (isProducerDetail(pathname)) return null;
  return <ChatWidget />;
}
