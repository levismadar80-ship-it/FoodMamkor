"use client";

/**
 * Module:   HubShell
 * Purpose:  MEH-3013 — the ONE head every «מה קורה» tab renders: the photo
 *           hero (eyebrow · H1 · subtitle) and, directly under it, the shared
 *           tab row. Four routes are four tabs of one hub, so switching tabs
 *           must change the words and the list, never the frame: same hero
 *           height, same type, same tab-row position, same content width.
 * Does NOT: render anything below the tab row. Each tab keeps its own
 *           filters and list; `HUB_CONTENT_CLASS` (lib/hub-layout.js) is the width they share.
 *           The tab row itself (gates, keyboard, in-place switch) is still
 *           owned by ListingHubTabs — this only fixes WHERE it sits.
 * Related:  components/ListingHubTabs.jsx (the row; HUB_TABS lists the four
 *           routes), __tests__/HubShellGuard.test.js (fails when a hub route
 *           builds its own head, or the row is mounted outside this shell).
 * History:  MEH-3013 (creation — /rescue had no hero and its own H1 above the
 *           tabs, /group-buys a short centred hero; both read as another site
 *           next to /events). Hero lifted from EventsClient (MEH-788).
 *           MEH-3113 (low band 150/200px min-height, smaller type: first
 *           event 662→536px at 375, 703→543px at 1440, measured; scrim
 *           kept ≥ 0.6 alpha to the top edge).
 */

import ListingHubTabs from "@/components/ListingHubTabs";
import { optimizeCloudinary } from "@/lib/cloudinary";

// MEH-788: license-clean Pexels market-produce photo, smart-cropped (g_auto)
// to a wide 16:9 band; w_1920 never upscales the 2400px original.
// REUSES: app/[locale]/events/EventsClient.jsx (MEH-788 hero, moved here)
const HERO_MAX_WIDTH = 1920;
const HUB_HERO_IMAGE = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1782159035/events/hero-market.jpg",
  { aspectRatio: "16:9", width: HERO_MAX_WIDTH }
);

// MEH-788: green-900 scrim, bottom-anchored, so white H1 + subtitle hold
// ≥ 4.5:1 over ANY crop.
// MEH-3113: the band is now low and its text fills most of it (and at 200%
// text the band grows with the text), so the scrim no longer fades to 0 at
// the top. Worst case is the eyebrow at 200% text, ~92% up: alpha ≈ 0.68,
// white over a pure-white crop ≈ 4.9:1. Min alpha 0.6 at the very top edge.
const HERO_SCRIM =
  "linear-gradient(to top," +
  "rgb(20 50 40 / 0.92) 0%," +
  "rgb(20 50 40 / 0.88) 50%," +
  "rgb(20 50 40 / 0.76) 85%," +
  "rgb(20 50 40 / 0.6) 100%)";

/**
 * @param {object} props
 * @param {string} props.active        HUB_TABS[].value of the tab showing
 * @param {string} props.eyebrow
 * @param {string} props.title         the page's only H1
 * @param {string} props.subtitle
 * @param {string} [props.image]       optimized hero URL; default = the market photo
 * @param {function} [props.onSelect]  passed through to ListingHubTabs
 * @param {React.ReactNode} [props.action] passed through to ListingHubTabs
 */
export default function HubShell({ active, eyebrow, title, subtitle, image = HUB_HERO_IMAGE, onSelect = null, action = null }) {
  return (
    <>
      {/* Full-bleed Ken Burns hero; honours prefers-reduced-motion through the
          global off-switch (globals.css). */}
      <section
        data-testid="hub-hero"
        className="relative isolate w-full overflow-hidden flex flex-col justify-end min-h-[150px] md:min-h-[200px]"
      >
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="kenburns-right absolute"
            style={{
              inset: "-5%",
              backgroundImage: `url(${image})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        </div>
        <div className="absolute inset-0" aria-hidden="true" style={{ backgroundImage: HERO_SCRIM }} />
        {/* MEH-3113: a low band (big-sites review, wave 1) so the list starts in the
            first screen. min-h, not h, and the text in normal flow: at 200% text
            the band grows instead of clipping the title. */}
        <div className="relative px-4 pt-8 pb-3.5 md:px-14 md:pt-10 md:pb-6 text-background">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold text-green-100">{eyebrow}</p>
            <h1 className="font-headline-display font-black text-2xl md:text-4xl leading-tight text-background mt-1 md:mt-2">
              {title}
            </h1>
            <p className="text-sm md:text-lg text-background/85 mt-1 md:mt-1.5 leading-snug">{subtitle}</p>
          </div>
        </div>
      </section>

      <ListingHubTabs active={active} onSelect={onSelect} action={action} />
    </>
  );
}
