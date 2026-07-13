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
      // MEH-1168 P2: the tab bar now sticks BELOW the global sticky header, so a
      // tapped section must land under BOTH. Measure the header (mobile ≈ 82px)
      // instead of only offsetting by the tab bar, which left headings behind it.
      const headerHeight =
        document.querySelector("header")?.getBoundingClientRect().height || 82;
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
