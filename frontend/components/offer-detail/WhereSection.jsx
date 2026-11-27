// @ts-check
"use client";

/**
 * Module:   WhereSection
 * Purpose:  «איפה ומתי מקבלים» for an offer page: icon rows (when, where,
 *           pickup, delivery), then the map with Waze / Google, or — when only
 *           a text address is known — the two navigation buttons alone. One
 *           block for the group buy and the rescue bag (Sapir 21/11: the group
 *           buy had text only, the bag a map).
 * Does NOT: fetch anything or choose which point to show; the page passes the
 *           point it already has. The street address stays off the group buy
 *           (MEH-829): there the map pins the business's own locations, the
 *           same as its page.
 * History:  MEH-3597 (creation; layout from RescueOfferDetails, MEH-3586)
 *
 * @typedef {{ key: string, Icon: any, label?: string, text: string, testId?: string }} WhereRow
 */
import dynamic from "next/dynamic";
// MEH-3946: an add-on whose chunk fails to load renders nothing, not the error page.
import { optionalChunk } from "@/lib/optional-chunk";
import SectionHeading from "@/components/ui/SectionHeading";
import { AddressNavLinks } from "@/components/NavAppGlyphs";

// REUSES: app/[locale]/events/[id]/EventDetailClient.jsx:45 — ssr:false,
// leaflet touches window at module eval.
const MiniMap = dynamic(optionalChunk(() => import("@/components/MiniMap"), "MiniMap"), { ssr: false });

/**
 * @param {{
 *   title: string,
 *   headingId: string,
 *   rows: WhereRow[],
 *   map?: { lat: number, lng: number, name: string, locations?: any[], producer?: any } | null,
 *   navLinks?: { waze: string, google: string } | null,
 *   navTestId?: string,
 *   testId?: string,
 *   children?: any,
 * }} props
 */
export default function WhereSection({ title, headingId, rows, map = null, navLinks = null, navTestId, testId, children }) {
  return (
    <section aria-labelledby={headingId} data-testid={testId}>
      <SectionHeading size="content" id={headingId} className="mb-3">{title}</SectionHeading>
      {rows.length > 0 && (
        <ul className="grid gap-3 text-base text-text mb-3">
          {rows.map(({ key, Icon, label, text, testId: rowTestId }) => (
            <li key={key} className="flex items-start gap-2" data-testid={rowTestId}>
              <Icon aria-hidden="true" size={20} className="text-primary shrink-0 mt-0.5" />
              <span className="min-w-0 whitespace-pre-line">
                {label && <b className="font-semibold">{label} </b>}
                {text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {map && <MiniMap lat={map.lat} lng={map.lng} name={map.name} locations={map.locations} producer={map.producer} />}
      {!map && navLinks && <AddressNavLinks links={navLinks} testId={navTestId} />}
      {children}
    </section>
  );
}
