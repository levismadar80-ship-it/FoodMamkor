"use client";

import dynamic from "next/dynamic";

// Client boundary so `ssr: false` is valid: the root layout is a Server
// Component (it exports generateMetadata), where next/dynamic ssr:false is
// disallowed. Defers the interaction-gated widget to a post-hydration chunk
// (it renders nothing until opened, so no SSR content is lost).
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), {
  ssr: false,
});

export default function ChatWidgetLazy() {
  return <ChatWidget />;
}
