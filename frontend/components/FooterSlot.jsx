"use client";

// MEH-731: locale-stripping usePathname (returns "/map" on /he/map and
// /en/map) so the `=== "/map"` check below fires under next-intl [locale]
// routing — next/navigation's usePathname keeps the locale prefix and the
// footer would wrongly render on /map.
import { usePathname } from "@/i18n/navigation";
import Footer from "@/components/Footer";

/**
 * MEH-30 #6 — the /map page fills the viewport with the Leaflet map +
 * bottom sheet; the site footer below it would eat vertical space and
 * create a confusing "scroll past the map" area. Hide the footer on
 * /map (and nested /map/* routes) only. Everywhere else the server
 * layout renders the real <Footer /> through this slot.
 */
export default function FooterSlot() {
  const pathname = usePathname();
  if (pathname === "/map" || pathname?.startsWith("/map/")) return null;
  return <Footer />;
}
