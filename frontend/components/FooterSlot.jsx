"use client";

import { usePathname } from "next/navigation";
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
