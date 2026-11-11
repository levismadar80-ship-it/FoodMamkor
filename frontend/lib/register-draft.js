/**
 * Module:   register-draft
 * Purpose:  Own the on-disk shape of the producer-registration draft — what is
 *           written, what counts as content worth resuming, and when a stored
 *           draft is too old to offer back.
 * Touches:  localStorage["producer_registration_draft"] (the caller does the
 *           actual read/write; this module owns the bytes in between).
 * Does NOT: render the resume banner or decide the wizard's step — that is
 *           RegisterProducerClient.jsx. This module reports what a stored
 *           draft CLAIMS its step was; the component decides whether that step
 *           is safe to land on (see `safeResumeStep` there).
 * Related:  app/[locale]/register/producer/RegisterProducerClient.jsx
 * History:  MEH-1769 (hasDraftContent, originally inline in the component);
 *           MEH-1977 (envelope + 7-day expiry, extracted here so the rules are
 *           testable without rendering a 1,700-line wizard);
 *           MEH-2915 (the draft stops carrying the person — see
 *           DRAFT_OMITTED_FIELDS).
 */

export const DRAFT_KEY = "producer_registration_draft";

/**
 * MEH-2915: fields the draft never carries.
 *
 * A draft exists so a seller who wanders off mid-wizard can pick it back up,
 * and it is scoped to the person who wrote it. The business name, city,
 * categories and story are what make resuming worth offering; the fields that
 * identify a person — her email, her own name, her phone, an address — are not
 * needed to resume anything, so the draft does not hold them.
 *
 * `password` was already stripped (MEH-1769) and keeps its place here so there
 * is ONE list rather than a special case beside a list.
 *
 * `address` / `lat` / `lng` / `address_city` are a second group: MEH-2640 moved
 * the address question out of registration entirely, so they are vestigial keys
 * of EMPTY_FORM that only ever hold a value in a draft written before that
 * shipped. They cannot be re-entered here in any case.
 *
 * Stripping on read keeps them out of the FORM; it does not by itself change
 * what is on disk. `parseDraft` therefore reports `stripped` so the caller can
 * rewrite the key — see the mount effect in RegisterProducerClient.jsx, which
 * re-packs at the draft's ORIGINAL `savedAt` so the rewrite cannot restart
 * MEH-1977's 7-day clock.
 *
 * `name` is the OWNER's full name («שם מלא», messages/he.json:200), not the
 * business name — that is `producer_name`, which stays.
 */
export const DRAFT_OMITTED_FIELDS = Object.freeze([
  "password",
  "email",
  "name",
  "phone",
  "address",
  "lat",
  "lng",
  "address_city",
]);

/**
 * MEH-2915: form fields that are never the seller's input, so their value
 * cannot be evidence that there is a fill worth resuming.
 *
 * `kind` is the one that mattered: EMPTY_FORM ships it as `"producer"`
 * (MEH-2460), a non-empty string, so `hasDraftContent` returned true for an
 * entirely untouched form and the resume banner offered back a draft holding
 * nothing.
 *
 * `city_known` is deliberately NOT here, though it is just as derived (it is
 * CitySearch's verdict ON `city`, never typed). Listing it would narrow what
 * counts as content — a draft holding `city_known: true` with an empty `city`
 * would stop earning a banner — and narrowing the caught set needs a reason
 * stronger than symmetry. `kind` has one: it is non-empty in EVERY draft ever
 * written, so it made the guard unconditional. `city_known` is false by
 * default and only moves when the seller has typed a town.
 */
export const NON_CONTENT_FIELDS = Object.freeze(["password", "kind"]);

/**
 * Drop every omitted field from a form-shaped object.
 *
 * @returns {{form: object, stripped: boolean}} `stripped` is true when the
 *   input actually carried one, which is what tells a caller the stored bytes
 *   are out of date and worth rewriting.
 */
function stripOmitted(form) {
  if (!form || typeof form !== "object" || Array.isArray(form)) {
    return { form, stripped: false };
  }
  const out = { ...form };
  let stripped = false;
  for (const field of DRAFT_OMITTED_FIELDS) {
    if (field in out) {
      delete out[field];
      stripped = true;
    }
  }
  return { form: out, stripped };
}

/**
 * MEH-1977: the stored value is an ENVELOPE, not the form object itself.
 *
 * Before this, the form object was written to localStorage bare, which left
 * nowhere to record when it was written — and therefore no way to expire it.
 * The obvious repair, adding `savedAt` alongside the form fields, is the one
 * that breaks quietly: `hasDraftContent` iterates every entry and treats any
 * truthy value as content, so a timestamp would make an entirely empty draft
 * claim to be resumable, and `setForm({...prev, ...parsed})` would carry
 * `savedAt` into form state and out in the submit body. Wrapping keeps the
 * metadata and the seller's data in separate rooms.
 */
export const DRAFT_VERSION = 2;

/** Seven days, per the card. The seller's own machine, so the clock is theirs. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * MEH-1769: a stored draft only earns the resume banner when the seller
 * actually entered something. Every field write mirrors the WHOLE form to
 * localStorage, so the stored object is normally EMPTY_FORM-shaped with empty
 * strings — its mere presence proves nothing about whether there is anything
 * to resume.
 *
 * The pre-1769 condition tested 3 of the 12 fields
 * (`producer_name || name || email`) and was wrong in both directions: a draft
 * where the seller had only picked a city or typed a phone never offered a
 * resume, and every field added to EMPTY_FORM since was invisible to it by
 * default. Checking every persisted value closes both.
 *
 * `password` is stripped before the write (`packDraft`) so it can never appear
 * here; the guard is defensive, not load-bearing.
 *
 * MEH-2915: the skip list widened from `password` alone to NON_CONTENT_FIELDS,
 * because "check every persisted value" is only the right rule while every
 * persisted value is something the seller typed. `kind` is not — see there.
 */
export function hasDraftContent(form) {
  if (!form || typeof form !== "object" || Array.isArray(form)) return false;
  return Object.entries(form).some(([field, value]) => {
    if (NON_CONTENT_FIELDS.includes(field)) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });
}

/**
 * Build the value to store. DRAFT_OMITTED_FIELDS never leave this function.
 * That is the one rule in here about WHO a stored draft belongs to; the rest
 * are about when it is still worth offering back.
 */
export function packDraft(form, step, now) {
  return JSON.stringify({
    v: DRAFT_VERSION,
    savedAt: now,
    step,
    form: stripOmitted(form || {}).form,
  });
}

/**
 * Read a stored draft back.
 *
 * Returns `null` for every reason a draft must not be offered — absent,
 * unparseable, wrong shape, or older than DRAFT_MAX_AGE_MS. A `null` return is
 * the caller's signal to DELETE the key: an expired draft that stays on disk is
 * the privacy half of this feature, not just the tidiness half.
 *
 * Returns `{ form, step, restamp }` otherwise. `restamp: true` means the value
 * on disk was written before this envelope existed, so its age is unknowable —
 * see below.
 *
 * @param {string|null} raw   the localStorage value
 * @param {number} now        injected, so the expiry can be tested without a
 *                            fake clock — a test that has to mock time to prove
 *                            an expiry is testing the mock as much as the rule
 */
export function parseDraft(raw, now) {
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  // LEGACY (pre-MEH-1977): the bare form object, with no version and no
  // timestamp. Its real age is unrecoverable, and the two ways to handle that
  // are not symmetric: treating it as expired would delete the in-flight draft
  // of every seller who happened to be mid-registration when this deployed —
  // a regression shipped on day one, to fix a staleness nobody had reported.
  // So it is grandfathered ONCE: the caller re-stamps it as v2 at `now`, after
  // which it ages normally. The cost is that one draft can outlive its true
  // 7 days by up to 7 more; the alternative cost is eating real work.
  if (parsed.v === undefined) {
    if (!isFormShaped(parsed)) return null;
    // A pre-envelope draft is rewritten by the caller in any case (restamp),
    // so `stripped` would be redundant here — it is reported all the same so
    // the return shape does not depend on which branch produced it.
    const { form, stripped } = stripOmitted(parsed);
    return { form, step: null, savedAt: null, restamp: true, stripped };
  }

  if (parsed.v !== DRAFT_VERSION) return null;
  if (typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt)) return null;
  // A savedAt in the future is a clock that moved backwards, not a fresh
  // draft. `now - savedAt` is then negative and would pass an `age > MAX`
  // test forever, so compare on the absolute distance.
  if (Math.abs(now - parsed.savedAt) > DRAFT_MAX_AGE_MS) return null;
  if (!isFormShaped(parsed.form)) return null;

  // MEH-2915: strip on the way OUT as well as on the way in. Drafts written
  // before this shipped are already on disk WITH those fields, so a change
  // that only stops writing them would hold from the first keystroke after
  // the deploy onwards and leave every existing draft untouched.
  const { form, stripped } = stripOmitted(parsed.form);
  return {
    form,
    step: typeof parsed.step === "number" ? parsed.step : null,
    // Handed back so a caller rewriting a stripped draft can re-pack at the
    // ORIGINAL stamp. Rewriting at `Date.now()` would restart the 7-day
    // expiry — the same defect the setAndSave no-op guard exists to prevent.
    savedAt: parsed.savedAt,
    restamp: false,
    stripped,
  };
}

/**
 * Shape gate, unchanged in intent from MEH-1769: reject anything that is not a
 * plain object, or whose `category_ids` is not an array. Drops garbage drafts
 * rather than merging a stale schema into form state.
 */
function isFormShaped(form) {
  return Boolean(
    form &&
      typeof form === "object" &&
      !Array.isArray(form) &&
      (form.category_ids === undefined || Array.isArray(form.category_ids)),
  );
}
