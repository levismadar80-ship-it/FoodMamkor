"use client";

// MEH-731: locale-stripping usePathname (returns "/map" on /he/map and
// /en/map) so the `=== "/map"` check below fires under next-intl [locale]
// routing — next/navigation's usePathname keeps the locale prefix and the
// footer would wrongly render on /map.
import { usePathname } from "@/i18n/navigation";
import Footer from "@/components/Footer";
import DashboardFooter from "@/components/DashboardFooter";

/**
 * MEH-30 #6 — the /map page fills the viewport with the Leaflet map +
 * bottom sheet; the site footer below it would eat vertical space and
 * create a confusing "scroll past the map" area. Hide the footer on
 * /map (and nested /map/* routes) only.
 *
 * MEH-1954 — producer-dashboard routes get the slim DashboardFooter:
 * the consumer footer is 741px of public navigation inside a management
 * tool (44% of the viewport on /producer/dashboard/events at 390×844,
 * measured in the MEH-999 audit). Every other route keeps the full
 * consumer <Footer />.
 */
export default function FooterSlot() {
  const pathname = usePathname();
  if (pathname === "/map" || pathname?.startsWith("/map/")) return null;
  if (pathname === "/producer/dashboard" || pathname?.startsWith("/producer/dashboard/")) {
    return <DashboardFooter />;
  }
  return <Footer />;
}
