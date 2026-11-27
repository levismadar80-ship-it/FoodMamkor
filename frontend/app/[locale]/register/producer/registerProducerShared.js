// @ts-check
/**
 * Constants and pure helpers of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx so the wizard
 * and its step files (./steps/*) read one copy.
 */
import { validateIsraeliPhone } from "@/lib/validators";

// MEH-847 (S7 Chunk B): wizard step enum — single source for the 3→5 re-index.
export const STEP = { ACCOUNT: 1, DETAILS: 2, CATEGORY: 3, STORY: 4, CONFIRM: 5 };
// MEH-435: readable step labels for funnel events (numeric step is
// re-index-fragile; the label is stable across the STEP enum).
// MEH-2640: step 2's four delivery controls collapse into one question.
// The pair of booleans is unchanged — this is only how she is asked.
// `onsite` is the schema default (has_physical_location: true,
// offers_delivery: false, schemas.py:957-958), so a visitor who never
// touches the radio still posts a coherent shape.
// MEH-2447: three answers now — «בשעות קבועות» (onsite), «בתיאום מראש»
// (arranged, producers.by_arrangement) and «משלוח» (delivery). onsite and
// arranged are two kinds of the same place, so they exclude each other; either
// one pairs with delivery. The stored value joins the ticked axes with "+" in
// FULFILMENT_AXES order, except onsite+delivery, which keeps its old name
// "both" so a draft saved before this change still loads.
// `fulfilment` is STORED, not derived from the booleans: the form's defaults
// ARE "onsite", so a derived value would never be "" and the required gate
// could never fire. «nothing ticked» is "" — the required gate's empty answer.
export const FULFILMENT_AXES = ["onsite", "arranged", "delivery"];
const EXCLUSIVE = { onsite: "arranged", arranged: "onsite" };

/** @param {string} value @returns {string[]} */
function axesOf(value) {
  if (value === "both") return ["onsite", "delivery"];
  const parts = String(value || "").split("+");
  return FULFILMENT_AXES.filter((a) => parts.includes(a));
}

/** @param {string[]} axes */
function valueOf(axes) {
  const ordered = FULFILMENT_AXES.filter((a) => axes.includes(a));
  return ordered.join("+") === "onsite+delivery" ? "both" : ordered.join("+");
}

/** @param {string} value @param {string} axis */
export function fulfilmentHasAxis(value, axis) {
  return axesOf(value).includes(axis);
}

/** @param {string} value @param {string} axis */
export function toggleFulfilmentAxis(value, axis) {
  const axes = axesOf(value);
  if (axes.includes(axis)) return valueOf(axes.filter((a) => a !== axis));
  return valueOf([...axes.filter((a) => a !== EXCLUSIVE[axis]), axis]);
}

/** @param {string} value */
export function fulfilmentBooleans(value) {
  const axes = axesOf(value);
  // Nothing answered (an organizer, or a pre-gate draft) posts the schema
  // default — a place, no delivery, not by arrangement.
  if (axes.length === 0) {
    return { has_physical_location: true, offers_delivery: false, by_arrangement: false };
  }
  return {
    has_physical_location: axes.includes("onsite") || axes.includes("arranged"),
    offers_delivery: axes.includes("delivery"),
    by_arrangement: axes.includes("arranged"),
  };
}

/**
 * MEH-2938: the store link as the register POST sends it. The wizard has no
 * <form>, so type="url" checks nothing, and «myshop.co.il» used to reach the
 * server's http(s) guard and fail the whole signup on its last step. A bare
 * domain gets «https://» in front (what browsers do with it in the address
 * bar); any other scheme is left alone for the server to refuse.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function storeLinkForPayload(value) {
  const v = (value || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

export const STEP_NAME = {
  [STEP.ACCOUNT]: "account",
  [STEP.DETAILS]: "details",
  [STEP.CATEGORY]: "category",
  [STEP.STORY]: "story",
  [STEP.CONFIRM]: "confirm",
};
// MEH-532: surfaces a dashboard reminder for sellers who deferred their story.
export const DESCRIPTION_PENDING_KEY = "description_pending";

// MEH-1807: the required fields that live on an EARLIER step than the submit
// button. Before this, all three were checked ONLY inside the submit handler,
// so a blank business name surfaced as "יש למלא שם עסק" next to "הצטרפו" on the
// last step — two frames away from the field, with no way back to it.
// The predicates are the SAME ones that ran there; they were moved, not added.
// MEH-2015 chunk B: `city` joined this list — MEH-951's visual-only exception
// (city carried a `required` marker that gated nothing) is revoked per
// Sapir's 14.8.2026 ruling; city is the discovery axis (map + filter), not a
// profile field.
// Order is wizard order: the first offender decides which step a bounced
// submit lands on.
export const CROSS_STEP_REQUIRED = [
  {
    field: "producer_name",
    step: STEP.DETAILS,
    focusId: "producer-business-name",
    messageKey: "producer_name_required",
    isMissing: (f) => !f.producer_name,
  },
  {
    field: "phone",
    step: STEP.DETAILS,
    focusId: "producer-phone",
    messageKey: "phone_required",
    isMissing: (f) => !f.phone || !validateIsraeliPhone(f.phone),
  },
  {
    field: "city",
    step: STEP.DETAILS,
    focusId: "producer-city",
    // MEH-2241 chunk B: free-text towns are forbidden (MEH-213) and this is the
    // layer that enforces it — a typed value CitySearch could not match (0
    // suggestions, never picked) is as missing as an empty one. The message
    // differs by cause: empty → «fill it in», typed-but-unknown → «pick from
    // the list» (MEH-2241 copy, ruled 22/10).
    messageKey: (f) => (f.city ? "city_pick_from_list" : "city_required"),
    isMissing: (f) => !f.city || !f.city_known,
  },
  {
    field: "category_ids",
    step: STEP.CATEGORY,
    focusId: "register-category-selector",
    messageKey: "category_required",
    // MEH-2460: an organizer carries no category — the step is skipped.
    isMissing: (f) => f.kind !== "organizer" && f.category_ids.length === 0,
  },
];

/**
 * MEH-1977: which step may a restored draft land on?
 *
 * The card asks for "restore lands on step 3 with data". That is safe on the
 * upgrade path and UNSAFE on the signup path, and the reason is the other half
 * of this same feature: **the password is deliberately never persisted**
 * (`packDraft` strips it). A signed-out seller dropped straight onto STORY
 * would carry an empty `form.password` into the submit body — and `password`
 * is not in CROSS_STEP_REQUIRED, so nothing bounces her back to ACCOUNT. She
 * would get a backend rejection pointing at no field, two frames from the
 * input that caused it. That is worse than re-typing three fields, which is
 * the whole thing the resume was for.
 *
 * So: with a token, the account frame is skipped anyway (`RegisterProducerClient.jsx`, the mount effect) and any
 * collected step is reachable. Without one, ACCOUNT must be crossed on foot.
 * CONFIRM is never a resume target under either — it is the post-submit
 * acknowledgement frame, reached only from a 200 (`RegisterProducerClient.jsx`, handleSubmit).
 */
export function safeResumeStep(storedStep, hasToken) {
  if (!hasToken) return null;
  if (typeof storedStep !== "number") return null;
  if (storedStep < STEP.DETAILS || storedStep > STEP.STORY) return null;
  return storedStep;
}

export const EMPTY_FORM = {
  email: "", name: "", password: "",
  producer_name: "", description: "", phone: "",
  city: "", address: "",
  // MEH-2241 chunk B: CitySearch's verdict on `city` — true only when the value
  // is a town the component can vouch for (picked from the list, or present in
  // the static list ∪ the fetched results). Rides the draft (packDraft keeps
  // it) so a restored, list-picked town is not re-challenged; never sent —
  // the submit body enumerates its fields.
  city_known: false,
  // MEH-1808: the coordinates AddressSearch hands back on select. Before this
  // they were dropped on the floor (:963-968 only wrote the address text) and
  // the submit body carried none, so EVERY business registering through the
  // public form landed with lat/lng NULL and never appeared on the map — no
  // matter whether the seller picked from the list or typed freely. The
  // backend has accepted and stored both all along (schemas.py:549-550,
  // auth.py:515-516); only the frontend was throwing them away.
  lat: null, lng: null,
  // Display-only mirror of the picked point's town (never sent; the payload's
  // `city` stays CitySearch's canonical value).
  address_city: "",
  short_description: "",
  category_ids: [],
  // MEH-530: optional at the form level. Backend 422s when any selected
  // category requires a license and this is empty — helper at
  // backend/app/services/license_validation.py.
  producer_license_number: "",
  // MEH-1471: self-reported attribution ("מאיפה שמעת עלינו?"). Required
  // dropdown on the final CONFIRM step (submit blocked while empty). The key is
  // one of REFERRAL_SOURCE_KEYS; referral_source_other holds the free-text
  // answer revealed only when "other" is chosen.
  referral_source: "",
  referral_source_other: "",
  // MEH-1838 chunk B: the delivery axis. Until this shipped the registration
  // form captured NO axis at all, so every business arrived identically and the
  // difference only surfaced if someone opened the dashboard and corrected it.
  //
  // Defaults mirror the payload contract byte for byte (schemas.py:701-704), so
  // a draft restored from before this block existed posts exactly what the
  // backend already defaults to — physical-only, no delivery — instead of a
  // shape the validator would reject.
  //
  // `delivery_cities` is the PAYLOAD field (schemas.py:704), NOT the legacy flat
  // Producer column of the same name. The router folds a non-empty list into
  // delivery_areas rows (auth.py:586-588) — the only store the consumer filter
  // reads (producer_listing.py:258). The column is never written (auth.py:550).
  // MEH-2460: "producer" (a business) | "organizer" (markets / events, sells
  // nothing — ADR-036). An organizer skips CATEGORY and the delivery axis;
  // the server writes its location shape (schemas.py _validate_location_mode).
  kind: "producer",
  // MEH-2640: one field for the one question step 2 now asks. "" = not
  // answered yet, which is what the required gate needs to be able to see.
  // delivery_nationwide / delivery_cities are no longer collected here at
  // all — the dashboard owns delivery areas, and ProducerRegister defaults
  // both (schemas.py:959-960).
  fulfilment: "",
  // MEH-2938: the online-store / order-form link (optional, step 2).
  external_order_form: "",
};

// MEH-1471: fixed dropdown order — English keys stored in the DB, Hebrew labels
// rendered from i18n (auth.register.producer.fields.referral_source.options.*).
// Mirror of backend/app/constants.py:REFERRAL_SOURCE_KEYS — keep in sync (the
// DB persists these exact strings). "other" reveals a free-text input.
export const REFERRAL_SOURCE_KEYS = [
  "business_referral",
  "friends_family",
  "instagram",
  "facebook",
  "google",
  "whatsapp_group",
  // MEH-2286: re-enabled once production /api/health reported a post-v1.1.0
  // sha — the backend that accepts it is live again.
  "direct_outreach",
  "other",
  "prefer_not_to_say",
];
