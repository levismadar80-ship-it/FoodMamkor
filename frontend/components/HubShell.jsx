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
// ≥ 4.5:1 over ANY crop (worst case ≈ 5.7:1 under the H1 top line).
const HERO_SCRIM =
  "linear-gradient(to top," +
  "rgb(20 50 40 / 0.92) 0%," +
  "rgb(20 50 40 / 0.88) 50%," +
  "rgb(20 50 40 / 0.72) 72%," +
  "rgb(20 50 40 / 0.30) 88%," +
  "rgb(20 50 40 / 0) 100%)";

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
        className="relative isolate w-full overflow-hidden h-[clamp(240px,34svh,300px)] md:h-[clamp(300px,40svh,380px)]"
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
        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 md:px-14 md:pb-10 text-background">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold text-green-100">{eyebrow}</p>
            <h1 className="font-headline-display font-black text-3xl md:text-6xl leading-tight text-background mt-1.5 md:mt-3">
              {title}
            </h1>
            <p className="text-base md:text-xl text-background/85 mt-2 leading-snug">{subtitle}</p>
          </div>
        </div>
      </section>

      <ListingHubTabs active={active} onSelect={onSelect} action={action} />
    </>
  );
}
