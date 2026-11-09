/**
 * Module:   HomepageMiniMapLazy
 * Purpose:  Fetch the homepage mini-map (Leaflet + its tiles) only when the
 *           visitor scrolls near it. Until then the SSR-able skeleton holds the
 *           exact same box, so nothing shifts.
 * Touches:  Nothing on its own — it decides WHEN the dynamic import runs.
 * Does NOT: Render the map (HomepageMiniMap.jsx) or its placeholder
 *           (HomepageMiniMapSkeleton.jsx).
 * Related:  app/[locale]/home/HomeClient.jsx (the only consumer).
 * History:  MEH-2850 option C (Sapir 09/11): the home page weighed over its
 *           Lighthouse budget; the mini-map sits below the fold on every
 *           viewport (MEH-2747), so Leaflet + tiles were bytes a first screen
 *           never shows.
 */

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import HomepageMiniMapSkeleton from "@/components/HomepageMiniMapSkeleton";

// MEH-538 + MEH-604: SSR-disabled (Leaflet touches `window`); the skeleton is
// the `loading` state too, so the swap from placeholder to map is one box.
const HomepageMiniMap = dynamic(() => import("@/components/HomepageMiniMap"), {
  ssr: false,
  loading: () => <HomepageMiniMapSkeleton />,
});

// Start loading this far before the map's box reaches the viewport — about
// one phone screen, so on a normal scroll the map is ready when it arrives.
export const MINIMAP_PRELOAD_MARGIN = "800px 0px";

export default function HomepageMiniMapLazy() {
  const sectionRef = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return undefined;
    // No IntersectionObserver (very old browsers): load at once, as before.
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") {
      setNear(true);
      return undefined;
    }
    const el = sectionRef.current;
    if (!el) return undefined;
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: MINIMAP_PRELOAD_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  if (near) return <HomepageMiniMap />;
  return <HomepageMiniMapSkeleton sectionRef={sectionRef} />;
}
