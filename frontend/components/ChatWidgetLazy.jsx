"use client";

import dynamic from "next/dynamic";

// ChatWidget is a client, interaction-gated assistant mounted globally in
// the root layout. The root layout is a Server Component (it exports
// generateMetadata), where `next/dynamic` with `ssr: false` is not allowed.
// This thin client wrapper defers ChatWidget into its own chunk that loads
// after hydration, keeping ~300 LOC of widget code out of every route's
// initial client bundle. The widget renders nothing until the user opens
// it, so there is no SSR content to lose.
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), {
  ssr: false,
});

export default function ChatWidgetLazy() {
  return <ChatWidget />;
}
