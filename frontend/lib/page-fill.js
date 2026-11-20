// @ts-check
/**
 * Module:   page-fill
 * Purpose:  «ספרו לנו על העסק» (MEH-3483): turn the server's draft of the page
 *           fields into preview rows, and the rows the owner kept into the
 *           writes that save them.
 * Touches:  nothing — pure. The component (components/PageFillPanel.jsx)
 *           fetches and writes.
 * Does NOT: decide what the text says (backend services/page_filler.py) or
 *           validate a write (PUT /producers/me does).
 * Rules:    a field that is already filled starts unchecked and says it
 *           replaces what is there; categories are added, never removed;
 *           delivery cities are written only when the business has none yet
 *           (an existing row holds days, minimums and fees a flat list would
 *           wipe); hours go to the primary location, never to the legacy
 *           `producer.opening_hours` (MEH-1938).
 * History:  MEH-3483 (creation)
 */

/** Plain string fields, written as-is to PUT /producers/me. */
const TEXT_FIELDS = [
  "description",
  "phone",
  "primary_contact_method",
  "instagram",
  "facebook",
  "website",
  "contact_email",
];

/**
 * @typedef {{ key: string, value: any, current: any, replaces: boolean,
 *   adds?: boolean, note?: "delivery_exists" | "hours_no_location" }} FillRow
 */

/** @param {any} v */
const filled = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null);

/** @param {any} profile */
function primaryLocation(profile) {
  const locs = Array.isArray(profile?.locations) ? profile.locations : [];
  return locs.find((l) => l?.is_primary) ?? null;
}

/**
 * @param {any} draft   PageDraft from the read route
 * @param {any} profile the business as GET /producers/me returns it
 * @param {{ hours?: boolean }} [opts] hours: false on the admin page (no
 *   location route there)
 * @returns {FillRow[]} only the fields the draft holds
 */
export function buildRows(draft, profile, opts = {}) {
  /** @type {FillRow[]} */
  const rows = [];
  for (const key of TEXT_FIELDS) {
    const value = draft?.[key];
    if (!filled(value)) continue;
    const current = profile?.[key] ?? null;
    if (current === value) continue;
    rows.push({ key, value, current, replaces: filled(current) });
  }
  const haveIds = new Set((profile?.categories ?? []).map((/** @type {any} */ c) => c.id));
  const newIds = (draft?.category_ids ?? []).filter((/** @type {number} */ id) => !haveIds.has(id));
  if (newIds.length) rows.push({ key: "categories", value: newIds, current: null, replaces: false, adds: haveIds.size > 0 });
  const cities = draft?.delivery_cities ?? [];
  if (cities.length) {
    const hasAreas = (profile?.delivery_areas ?? []).length > 0;
    rows.push({
      key: "delivery", value: cities, current: null, replaces: false,
      ...(hasAreas && { note: /** @type {const} */ ("delivery_exists") }),
    });
  }
  const hours = draft?.opening_hours;
  if (filled(hours)) {
    const loc = opts.hours === false ? null : primaryLocation(profile);
    const current = loc?.opening_hours ?? null;
    if (current !== hours) {
      rows.push({
        key: "hours", value: hours, current, replaces: filled(current),
        ...(!loc && { note: /** @type {const} */ ("hours_no_location") }),
      });
    }
  }
  return rows;
}

/** A row that can be saved: one with a note only points elsewhere. */
export const canSave = (/** @type {FillRow} */ row) => !row.note;

/** Checked by default: new information yes, a replacement no. */
export const startsChecked = (/** @type {FillRow} */ row) => canSave(row) && !row.replaces;

/**
 * @param {FillRow[]} kept the rows the owner left checked
 * @param {any} profile
 * @returns {{ producer: Record<string, any> | null,
 *   location: { id: string, opening_hours: string } | null }}
 */
export function buildWrites(kept, profile) {
  /** @type {Record<string, any>} */
  const producer = {};
  let location = null;
  for (const row of kept.filter(canSave)) {
    if (TEXT_FIELDS.includes(row.key)) producer[row.key] = row.value;
    else if (row.key === "categories") {
      const have = (profile?.categories ?? []).map((/** @type {any} */ c) => c.id);
      producer.category_ids = [...have, ...row.value];
    } else if (row.key === "delivery") {
      producer.delivery_areas = row.value.map((/** @type {string} */ city) => ({ city }));
      producer.offers_delivery = true;
    } else if (row.key === "hours") {
      const loc = primaryLocation(profile);
      if (loc) location = { id: loc.id, opening_hours: row.value };
    }
  }
  return { producer: Object.keys(producer).length ? producer : null, location };
}
