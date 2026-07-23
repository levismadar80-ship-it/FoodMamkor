import { useCallback, useRef, useState } from "react";

/**
 * Owns the mobile tab-bar state for ProducerDetail — the active tab,
 * the per-section refs, and the smooth-scroll handler that snaps a
 * section into view below the sticky tab bar.
 *
 * Verbatim extraction from ProducerDetail.jsx:51,53-54,80-88. The
 * 56px / 16px offsets are preserved exactly; they match the tab-bar
 * height + visual breathing room used by the legacy IIFE.
 */
export function useTabScroll() {
  const [activeTab, setActiveTab] = useState("about");
  const sectionRefs = useRef({});
  const tabBarRef = useRef(null);

  const scrollToSection = useCallback((key) => {
    setActiveTab(key);
    const el = sectionRefs.current[key];
    if (el) {
      const tabBarHeight = tabBarRef.current?.offsetHeight || 56;
      // MEH-1168 P2: the tab bar sticks BELOW the global sticky header, so a
      // tapped section must land under BOTH.
      // MEH-1202: prefer the header height Header.jsx publishes as the
      // `--chrome-top` CSS var (single source of truth); fall back to a live
      // measurement, then 82px — so no page-specific hardcode leads here.
      const publishedTop = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--chrome-top"),
        10,
      );
      const headerHeight =
        publishedTop ||
        document.querySelector("header")?.getBoundingClientRect().height ||
        82;
      const y =
        el.getBoundingClientRect().top +
        window.scrollY -
        headerHeight -
        tabBarHeight -
        16;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, []);

  return { activeTab, sectionRefs, tabBarRef, scrollToSection };
}
