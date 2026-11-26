// @ts-check
/**
 * Module:   owner-pages
 * Purpose:  The dashboard paths the owner assistant may link to, which screen
 *           a dashboard URL belongs to, and the function that splits an answer
 *           into text and links to exactly those paths.
 * Touches:  nothing — pure data + pure functions.
 * Does NOT: hold the screens' descriptions for the model
 *           (backend/app/owner_sections.py) or the link labels (messages
 *           `owner_assistant.pages.<key>` / `.anchors.<anchor>`).
 * Related:  backend/app/owner_sections.py (the same paths; the pytest
 *           tests/test_owner_assistant.py fails when the two differ) ·
 *           lib/site-pages.js (the site chat's list, also linked here) ·
 *           lib/business-features.js DASHBOARD_SUBPAGES (sub-page → screen).
 * History:  owner assistant (26/11).
 *
 * A path the model made up is in neither list, so it stays plain text: the
 * assistant never renders a link that can 404.
 */

import { SITE_PAGES } from "./site-pages.js";
import { DASHBOARD_SUBPAGES } from "./business-features.js";

/** @type {Readonly<Record<string, string>>} path → label key */
const OWNER_PAGES = Object.freeze({
  "/producer/dashboard": "overview",
  "/producer/dashboard/edit": "edit",
  "/producer/dashboard/insights": "insights",
  "/producer/dashboard/tools": "tools",
  "/producer/dashboard/orders": "orders",
  "/producer/dashboard/events": "events",
  "/producer/dashboard/experiences": "experiences",
  "/producer/dashboard/group-buys": "group_buys",
  "/producer/dashboard/recipes": "recipes",
  "/producer/dashboard/rescue": "rescue",
  "/producer/dashboard/reviews": "reviews",
  "/producer/dashboard/google-profile": "google_profile",
  "/producer/dashboard/share": "share",
  "/producer/dashboard/offer": "offer",
  "/producer/dashboard/followers": "followers",
  "/producer/dashboard/whats-new": "whats_new",
});

/** Edit-page cards, linked as /producer/dashboard/edit#<anchor>. */
/** @type {Readonly<Record<string, string>>} anchor → label key */
const OWNER_ANCHORS = Object.freeze({
  "images": "images",
  "bio": "bio",
  "categories": "categories",
  "locations": "locations",
  "products": "products",
  "hours": "hours",
  "delivery": "delivery",
  "contact-channels": "contact-channels",
  "tags": "tags",
  "license": "license",
  "kashrut": "kashrut",
  "owner-story": "owner-story",
  "questions": "questions",
});

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

/**
 * The screen a dashboard URL belongs to: a sub-page («אירוע חדש», a print
 * view) answers its parent, so the assistant hears one of OWNER_PAGES.
 * @param {string} pathname locale-stripped
 * @returns {string | null}
 */
export function ownerSectionFor(pathname) {
  const path = String(pathname || "").replace(UUID_SEGMENT, "/[id]").replace(/\/$/, "");
  if (OWNER_PAGES[path]) return path;
  const parent = /** @type {Record<string, string>} */ (DASHBOARD_SUBPAGES)[path];
  return parent && OWNER_PAGES[parent] ? parent : null;
}

// A path (same shape as site-pages.js PATH_RE); an #anchor right after it is
// read separately with ANCHOR_RE, so neither pattern nests a quantifier.
const PATH_RE = /(?<![A-Za-z0-9/:.])\/[a-z][a-z0-9/-]*/g;
const ANCHOR_RE = /#[a-z-]+/y;

/**
 * @typedef {{ type: "text", value: string }
 *   | { type: "link", href: string, ns: "owner" | "anchor" | "site", key: string }} OwnerPart
 */

/** @param {string} raw @returns {Omit<Extract<OwnerPart, { type: "link" }>, "type"> | null} */
function resolve(raw) {
  const [path, anchor] = raw.split("#");
  if (anchor !== undefined) {
    if (path !== "/producer/dashboard/edit" || !OWNER_ANCHORS[anchor]) return null;
    return { href: raw, ns: "anchor", key: OWNER_ANCHORS[anchor] };
  }
  if (OWNER_PAGES[path]) return { href: path, ns: "owner", key: OWNER_PAGES[path] };
  if (SITE_PAGES[path]) return { href: path, ns: "site", key: SITE_PAGES[path] };
  return null;
}

/**
 * @param {string} text
 * @returns {OwnerPart[]}
 */
export function splitOwnerLinks(text) {
  const src = String(text ?? "");
  /** @type {OwnerPart[]} */
  const parts = [];
  let last = 0;
  for (const match of src.matchAll(PATH_RE)) {
    let raw = match[0];
    ANCHOR_RE.lastIndex = (match.index ?? 0) + raw.length;
    const anchor = ANCHOR_RE.exec(src);
    if (anchor) raw += anchor[0];
    else while (raw.endsWith("/") || raw.endsWith("-")) raw = raw.slice(0, -1);
    const link = resolve(raw);
    if (!link) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", value: src.slice(last, start) });
    parts.push({ type: "link", ...link });
    last = start + raw.length;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  return parts;
}

/**
 * Open an edit card on the screen she is already on. Next's router changes
 * the hash with pushState, which fires no `hashchange`, so the edit hub would
 * not open the card; setting location.hash does fire it.
 * @param {string} anchor
 */
export function openEditCard(anchor) {
  if (typeof globalThis.location === "undefined") return;
  globalThis.location.hash = anchor;
}
