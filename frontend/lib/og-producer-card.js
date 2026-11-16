// @ts-check
/**
 * Module:   og-producer-card
 * Purpose:  The branded link-preview image of a business page (1200×630):
 *           what WhatsApp and Facebook show when the page is pasted. Two
 *           templates — the business's own photo under a dark-green fade, or,
 *           with no photo, a typographic card on cream. Name, «type · city»
 *           and the brand pill; nothing else (MEH-3329: tags were unreadable
 *           on a phone in the mockup).
 * Does NOT: fetch data or encode the image — app/og/producer/[file]/route.js
 *           does both. Holds no copy of its own: every string is the
 *           business's data or BRAND_NAME.
 * Related:  lib/og-rtl.js (Hebrew in Satori), lib/seo.js buildProducerMetadata.
 * History:  MEH-3329 (creation).
 */
import { rtlLine } from "./og-rtl";
import { BRAND_NAME } from "./constants";

export const OG_SIZE = { width: 1200, height: 630 };
const GREEN = "#2e6853";
const DEEP_GREEN = "31,74,59";
const CREAM = "#F5F0E8";
const INK = "#2b2b28";
const LONG_NAME = 34;

/**
 * The brand mark as an <img> source — the caller passes public/favicon.svg's
 * text, so the image always draws the site's own mark (MEH-2834).
 * @param {string} svg
 */
export function markSrc(svg) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/** @param {{ type?: string, city?: string }} p */
export function metaLine({ type, city }) {
  return [type, city].filter(Boolean).join(" · ");
}

/** @param {"light" | "dark"} tone @param {string} mark */
function brandPill(tone, mark) {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        top: 40,
        right: 48, // rtl-ok — Satori has no logical properties; the image is RTL by design
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: 10,
        padding: "8px 22px 8px 18px",
        borderRadius: 999,
        background: tone === "dark" ? CREAM : "#ffffff",
        color: GREEN,
        fontFamily: "Frank",
        fontSize: 30,
      },
      children: [
        { type: "img", props: { src: mark, width: 40, height: 40 } },
        rtlLine(BRAND_NAME),
      ],
    },
  };
}

/** @param {string} name */
function nameSize(name) {
  return name.length > LONG_NAME ? 60 : 78;
}

/**
 * @param {{ name: string, type?: string, city?: string, photo?: string | null, mark: string }} p
 */
export function producerCard({ name, type, city, photo, mark }) {
  const meta = metaLine({ type, city });
  if (photo) {
    return {
      type: "div",
      props: {
        style: { width: "100%", height: "100%", display: "flex", position: "relative", background: GREEN },
        children: [
          {
            type: "img",
            props: { src: photo, width: OG_SIZE.width, height: OG_SIZE.height, style: { position: "absolute", top: 0, left: 0, objectFit: "cover" } }, // rtl-ok
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 0, right: 0, bottom: 0, left: 0, // rtl-ok — Satori has no inset shorthand
                display: "flex",
                backgroundImage: `linear-gradient(to top, rgba(${DEEP_GREEN},0.96) 0%, rgba(${DEEP_GREEN},0.72) 32%, rgba(${DEEP_GREEN},0) 68%)`,
              },
            },
          },
          brandPill("dark", mark),
          {
            type: "div",
            props: {
              style: { position: "absolute", left: 64, right: 64, bottom: 52, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }, // rtl-ok
              children: [
                rtlLine(name, { fontFamily: "Frank", fontSize: nameSize(name), color: "#ffffff", lineHeight: 1.1, justifyContent: "flex-start" }),
                meta ? rtlLine(meta, { fontFamily: "Heebo", fontSize: 34, color: CREAM }) : null,
              ].filter(Boolean),
            },
          },
        ],
      },
    };
  }
  return {
    type: "div",
    props: {
      style: { width: "100%", height: "100%", display: "flex", position: "relative", background: CREAM },
      children: [
        {
          type: "img",
          props: { src: mark, width: 560, height: 560, style: { position: "absolute", left: -90, top: 35, opacity: 0.12 } }, // rtl-ok
        },
        { type: "div", props: { style: { position: "absolute", top: 0, bottom: 0, right: 0, width: 28, background: GREEN } } }, // rtl-ok
        brandPill("light", mark),
        {
          type: "div",
          props: {
            style: { position: "absolute", left: 96, right: 120, bottom: 96, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }, // rtl-ok
            children: [
              rtlLine(name, { fontFamily: "Frank", fontSize: nameSize(name) + 6, color: GREEN, lineHeight: 1.1 }),
              meta ? rtlLine(meta, { fontFamily: "Heebo", fontSize: 38, color: INK }) : null,
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}
