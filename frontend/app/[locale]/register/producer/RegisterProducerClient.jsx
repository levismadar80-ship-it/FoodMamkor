"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle, Leaf } from "@phosphor-icons/react";
import api from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { detailToMessage } from "@/lib/errors";
import CategoryRequestModal from "@/components/CategoryRequestModal";
import RegisterPreflight from "./RegisterPreflight";
import AccountStep from "./steps/AccountStep";
import DetailsStep from "./steps/DetailsStep";
import CategoryStep from "./steps/CategoryStep";
import StoryStep from "./steps/StoryStep";
import ConfirmUpgradedStep from "./steps/ConfirmUpgradedStep";
import ConfirmInboxStep from "./steps/ConfirmInboxStep";
import {
  STEP,
  fulfilmentBooleans,
  STEP_NAME,
  safeResumeStep,
  EMPTY_FORM,
} from "./registerProducerShared";
// MEH-1808: Leaflet touches `window` at import time, so the confirmation map is
// client-only — same mount idiom as every other consumer
// (ExperienceDetailClient.jsx:17, EventDetailClient.jsx).
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });
// Street-level framing for a "is this the right spot?" check. MiniMap's own
// default (14) is neighbourhood context for a business page — a different job.
const ADDRESS_CONFIRM_ZOOM = 16;
import { validateIsraeliPhone } from "@/lib/validators";
import { useAuth } from "@/lib/auth-context";
import { getSeasonalPlaceholder } from "@/lib/producer-description-placeholders";
import {
  hasLicenseFormatWarning,
  requiresProducerLicense,
} from "@/lib/license-required-categories";
// MEH-1977: the draft's on-disk rules (envelope, 7-day expiry, what counts as
// content) live in one module so they can be tested without rendering this
// wizard. What is NOT there: which step a restored draft may land on — that
// depends on auth state, which only this component knows.
import {
  DRAFT_KEY,
  hasDraftContent,
  packDraft,
  parseDraft,
} from "@/lib/register-draft";
import { FARMER_DECLARATION_CATEGORIES } from "@/lib/farmer-declaration";
import BrandLoader from "@/components/BrandLoader";
import { showToast } from "@/lib/toast";
import { shareOrCopyText } from "@/lib/share-link";

// MEH-3294: wizard constants and pure helpers live in ./registerProducerShared.

function RegisterProducerPageFallback() {
  const t = useTranslations();
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center text-fg-muted">
      {t("auth.register.producer.loading_form")}
    </div>
  );
}

// MEH-2773: `kind` comes from the ROUTE, not from a control on the page.
// /register/producer → "producer"; /register/organizer → "organizer". The
// organizer door used to be a secondary line under the business CTA (MEH-2640),
// which showed every business owner a path that is not hers. Organizers now
// get their own link, which Sapir sends them directly.
export default function RegisterProducerPage({ kind = "producer" }) {
  return (
    <Suspense fallback={<RegisterProducerPageFallback />}>
      <RegisterProducerPageBody routeKind={kind === "organizer" ? "organizer" : "producer"} />
    </Suspense>
  );
}

function RegisterProducerPageBody({ routeKind }) {
  const routeIsOrganizer = routeKind === "organizer";
  const routePath = routeIsOrganizer ? "/register/organizer" : "/register/producer";
  const t = useTranslations();
  // MEH-2827 PR 8: «הזמינו בתי עסק» opens the phone's own share sheet. The
  // approved message keeps its words; its link travels as `url` (iOS then
  // shares a link card), the rest as text. No sheet → copy the link.
  const shareRegisterInvite = async () => {
    const msg = t("auth.register.producer.success.share_msg");
    const url = (msg.match(/https?:\/\/\S+/) || [])[0];
    const text = url ? msg.replace(url, "").trim() : msg;
    // MEH-2996: the site's one share sequence (lib/share-link.js).
    const outcome = await shareOrCopyText({ data: url ? { text, url } : { text }, copyText: url || msg });
    if (outcome === "copied") showToast.success(t("share.copied_toast"));
  };
  const router = useRouter();
  const params = useSearchParams();
  const prefillToken = params.get("prefill");
  const { user, loading: authLoading, refreshUser } = useAuth();
  // MEH-143: if already logged in, skip account-creation step.
  const isUpgrade = !!user;
  // Initialize step from localStorage token so there's no flicker — auth
  // context loads async, but the token presence is synchronous.
  // Wrapped in try/catch — localStorage can throw on quota / private-mode.
  const [step, setStep] = useState(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("token")) return STEP.DETAILS;
    } catch {
      // private browsing / storage disabled — fall through to step 1
    }
    return STEP.ACCOUNT;
  });
  const [prefillApplied, setPrefillApplied] = useState(false);
  // MEH-994: pre-flight intro screen ("לפני שמתחילים") gates the wizard until
  // the CTA is clicked. Entry chrome only — no STEP change, no localStorage
  // "seen" flag (shows on every visit by design). Both auth states see it;
  // the upgrade path hides the account-creation checklist line.
  // MEH-2773: the organizer route skips it — its checklist (license, product
  // photos) and its «what happens after» are about a business.
  const [showPreflight, setShowPreflight] = useState(!routeIsOrganizer);
  const [categories, setCategories] = useState([]);
  // MEH-3193: a failed /categories left step 3 with no tiles and a required
  // choice nobody could make. Now it says so and offers a retry.
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const loadCategories = () => {
    setCategoriesFailed(false);
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => setCategoriesFailed(true));
  };
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // MEH-1769: false on the server AND on the first client render, raised only
  // by the mount effect below once the storage read has resolved. That ordering
  // is what keeps the banner off a first paint entirely — there is no
  // pre-hydration frame in which it can appear and then vanish, so this is NOT
  // the accepted first-paint flash BusinessCtaLink.jsx documents for MEH-1489
  // (that one paints a default branch and swaps it; this one paints nothing).
  // Same shape as InstallPrompt.jsx: default hidden, storage read inside an
  // effect. Do not move this read into a lazy useState initialiser — that runs
  // during SSR too, where localStorage does not exist.
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, kind: routeKind }));
  const [stepError, setStepError] = useState("");
  // MEH-2640: the fulfilment question's error lives in its OWN state, not in
  // `fieldErrors`. That map is documented just below as holding ONLY the
  // CROSS_STEP_REQUIRED fields, and `crossStepErrors` is derived from it — so
  // a fulfilment key in there inflated the submit-gate summary to two
  // offenders while listing one, which is exactly what
  // RegisterProducerClient.test.jsx caught.
  const [fulfilmentError, setFulfilmentError] = useState("");
  // MEH-1807: per-field messages for CROSS_STEP_REQUIRED, keyed by form field.
  // Only ever holds those three, which is what lets the STORY summary below
  // derive itself from this object instead of carrying its own state — an
  // entry disappearing on-change (Baymard) removes the summary line too.
  const [fieldErrors, setFieldErrors] = useState({});
  // MEH-1807: the element the NEXT render must focus. The id rides a ref and
  // only the sequence number is state, so requesting focus twice for the SAME
  // field still re-fires the effect and the effect never has to setState to
  // consume the request (no cascading render). requestFocus is called in the
  // same handler as setStep, so React batches both into one render and the
  // effect runs after the destination frame has mounted.
  const pendingFocusIdRef = useRef(null);
  const [focusRequestSeq, setFocusRequestSeq] = useState(0);
  // MEH-1807: true only while a FINAL-SUBMIT bounce is unresolved. A per-step
  // block sets fieldErrors too, but moves nobody — the summary's copy
  // ("הועברתם לשדה") would be a false statement there.
  const [submitBounced, setSubmitBounced] = useState(false);
  // MEH-952: blocking error shown next to the license field on CATEGORY when a
  // license-required category is selected but the number is blank — surfaces the
  // requirement at the field instead of letting the backend 422 land on STORY.
  // The backend check in license_validation.py stays the unchanged backstop.
  const [licenseRequiredError, setLicenseRequiredError] = useState(false);
  // MEH-971: license-pending opt-in. When checked (license-required category
  // only), the CATEGORY advance gate stops blocking on an empty license and the
  // submit sends license_pending:true so the producer can register without a
  // license number and enter the pending queue.
  const [licensePending, setLicensePending] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // MEH-759 Chunk C (ADR-022 gate 2): the binding licensing declaration and
  // the conditional grower declaration are separate affirmative acts from the
  // ToS/privacy consent above (ADR-014 voice: first-person legal vs plural
  // chrome). Both fold into the single declaration_accepted bool — no new API
  // field. A distinct affirmative act = stronger evidentiary value (Brief Q1.4).
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [farmerConfirmed, setFarmerConfirmed] = useState(false);
  // MEH-328 Chunks C+D: emailExistsWarning (onBlur) + emailExistsSubmitError
  // (409 on submit) state both removed. Backend's non-upgrade path no longer
  // returns 409 (collisions return identical 200 ack); the duplicate-attempt
  // email is the only signal to the legitimate owner. Upgrade-path 409
  // ("user already has producer") flows through the existing `error` state.
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  // MEH-287: true when server confirms Twilio config is present (WhatsApp
  // expected to arrive). False → show dashboard-fallback banner on step 3.
  // MEH-328: only meaningful on the upgrade path (non-upgrade renders the
  // inbox-check screen which doesn't reference WhatsApp).
  const [whatsappSent, setWhatsappSent] = useState(true);
  // MEH-328 Chunk D: step-3 branch signal. True after a successful upgrade
  // (response had access_token); false after a successful non-upgrade
  // signup (response was the OWASP ack). Drives step-3 render branching.
  const [didUpgrade, setDidUpgrade] = useState(false);
  // MEH-1814: the post-submit screen OWNS the render from the moment the
  // submit succeeds. Set BEFORE refreshUser() so there is no render in which
  // the role has flipped to "producer" while this is still false — the two
  // updates are in program order, so React can never apply the later one
  // first. This is what makes the fix an ordering guarantee rather than a
  // race that usually wins.
  const [submitted, setSubmitted] = useState(false);
  // MEH-532: seasonal placeholder is locked to the value at first render
  // so it doesn't flicker if the user crosses a season boundary mid-session.
  // Disabled flag is set when the seller picks "אני אכתוב אחר כך".
  const [descriptionPlaceholder] = useState(() => getSeasonalPlaceholder());
  const [descriptionDisabled, setDescriptionDisabled] = useState(false);
  // MEH-619: snapshot of the user-typed description captured at the moment
  // they click "אני אכתוב אחר כך", so the matching "ערוך תיאור" undo link
  // can restore it. Plain ref (not state) — the value is read only inside
  // the undo handler; no re-render needed when it changes.
  const descriptionBeforeDisableRef = useRef("");
  // MEH-530: optional path expanded-toggle. Required path renders the field
  // directly (no toggle). Whether the path is required is derived live from
  // the selected category IDs against the categories list fetched at mount.
  const [licenseOptionalExpanded, setLicenseOptionalExpanded] = useState(false);
  const isOrganizer = form.kind === "organizer"; // MEH-2460
  // MEH-2640: the stored answer; the payload's booleans come from it.
  const fulfilment = form.fulfilment;
  const licenseRequired =
    !isOrganizer && requiresProducerLicense(categories, form.category_ids);
  const licenseWarning = hasLicenseFormatWarning(form.producer_license_number);
  // MEH-1807: the phone field has two distinct error sources — the pre-existing
  // as-you-type format check (fires only once something is typed) and the new
  // required-gate message (fires on empty too). One derived string so the
  // aria-invalid / aria-describedby / border wiring has a single condition.
  const phoneErrorMessage =
    fieldErrors.phone ||
    (form.phone && !validateIsraeliPhone(form.phone)
      ? t("auth.register.producer.validation.phone_invalid")
      : "");
  // MEH-2640: addressConfirmed / addressConfirmLabel / addressCityMismatch
  // left with the address block. `form.address` and lat/lng stay in the form
  // shape (and in the payload, where the schema makes them optional) so the
  // upgrade path keeps its keys.
  // MEH-2915: a saved draft no longer does — address/lat/lng/address_city are
  // in DRAFT_OMITTED_FIELDS, so they live in form state for the session only.

  // MEH-1807: the GOV.UK-style summary next to "הצטרפו" is DERIVED from
  // fieldErrors rather than stored, so fixing a field removes its summary row
  // with no second piece of state to keep in sync.
  const crossStepErrors = Object.entries(fieldErrors);
  // MEH-759 Chunk C: the grower declaration line is shown (and required) only
  // for the two agricultural categories. Name-match mirrors requiresProducerLicense
  // (IDs are seed-ordering-dependent; names are stable). Source: seed_data.py:15-16.
  const farmerDeclarationRequired =
    !isOrganizer &&
    categories
      .filter((c) => form.category_ids.includes(c.id))
      .some((c) => FARMER_DECLARATION_CATEGORIES.includes(c.name));

  // Sync step when auth resolves (user may load after initial render).
  useEffect(() => {
    if (isUpgrade && step === STEP.ACCOUNT) setStep(STEP.DETAILS);
  }, [isUpgrade]); // eslint-disable-line react-hooks/exhaustive-deps

  // MEH-435: funnel instrumentation. One effect covers every step transition
  // (forward, back, OAuth jump, and the CONFIRM landing) — DRY over
  // instrumenting each setStep call site. Gated on showPreflight so the first
  // "step_viewed" fires when the wizard actually opens, not on the pre-flight
  // intro screen. trackEvent is itself consent-gated + no-op unless a PostHog
  // key is set, so this is safe to fire unconditionally here.
  useEffect(() => {
    if (showPreflight) return;
    trackEvent("producer_register_step_viewed", { step: STEP_NAME[step] });
  }, [step, showPreflight]);

  // MEH-2138 chunk F: the wizard is ONE long page, so submitting from STORY
  // leaves the scroll position exactly where the seller left it. Measured at
  // 1440 on staging: docH 1493, viewport 900, scrollY 539 — the success screen
  // mounts entirely above the fold and she lands on the FOOTER, not on the
  // thing she just earned. (It is why MEH-2136's hierarchy fix read as a no-op
  // in the desktop before/after captures: the screen was correct and unseen.)
  //
  // One effect on `step`, not a call inside each branch. It began as a
  // CONFIRM-only effect for the reason below — CONFIRM renders two different
  // screens, the upgrade path and the inbox-check path, and a third added
  // later cannot forget this — and MEH-2927 widened it to every step change on
  // the same DRY argument: a frame added to the wizard later gets this for
  // free rather than having to remember it.
  //
  // `behavior: "instant"` is deliberate and is NOT the convention 20 lines
  // below, which omits `behavior` to defer to the stylesheet. That call moves
  // focus to an errored field mid-form, where a smooth ride is a sighted user
  // tracking WHERE the page went; here there is nothing to track — the
  // destination is a screen she has not seen yet, and an animated approach to
  // it is precisely what prefers-reduced-motion exists to suppress. "instant"
  // says that unconditionally instead of inheriting whatever `scroll-behavior`
  // happens to be on <html>. Precedent for the literal: ChipScrollRow.jsx:158.
  // MEH-2927 (pilot B3a): EVERY step change starts at the top of the new step,
  // not only CONFIRM. Measured at 390x844 before this: advancing ACCOUNT →
  // DETAILS kept `scrollY` at 460 and left the step heading at y=-330, so the
  // seller landed mid-form on a frame whose top she had never seen — four
  // fields and the step's own question were above her.
  // (Those numbers are the probe's output, quoted in the PR; the committed
  // frame qa-artifacts/MEH-2927/02-step2-on-entry-390-AFTER.webp is the same
  // view AFTER the fix. The before frame was not committed, so it is not
  // cited as though it were.)
  //
  // The ONE exception is a cross-step validation bounce. MEH-1807 sets
  // `pendingFocusIdRef` synchronously in `requestFocus`, BEFORE the `setStep`
  // that sends her back, then focuses the offending field and scrolls it to
  // `block: "center"`. Jumping to the top first would move the page out from
  // under that and land her above the error she was sent to fix. The ref is
  // still populated here because this effect is declared ABOVE the focus
  // effect, so it runs first in the same commit — do not reorder them.
  // Mount is not a step CHANGE, and scrolling there would be a no-op at best
  // and a fight with the browser's own scroll restoration on a back-navigation
  // at worst. A draft that resumes onto a later frame still scrolls, because
  // that `setStep` lands after this ref is already set.
  // Compares the previous step rather than arming a flag on first run: in
  // StrictMode (dev) the effect body runs twice on mount, so a "have I run
  // before" flag is set by the first invocation and the second one scrolls a
  // page nobody navigated. A previous-value comparison is false on both.
  const prevStepRef = useRef(step);
  useEffect(() => {
    const previous = prevStepRef.current;
    prevStepRef.current = step;
    if (previous === step) return;
    if (pendingFocusIdRef.current) return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  // MEH-1807 (GOV.UK error-summary pattern): move focus to the offending field
  // so the seller lands ON it, not merely near it. The id is queried rather
  // than held in a ref because a cross-step bounce focuses a field that did not
  // exist in the DOM when the submit button was clicked.
  useEffect(() => {
    const targetId = pendingFocusIdRef.current;
    if (!targetId) return;
    pendingFocusIdRef.current = null;
    const el = document.getElementById(targetId);
    if (el) {
      el.focus();
      // No explicit `behavior`: passing "smooth" here would override CSS
      // scroll-behavior, including the `!important` reset globals.css:145 applies
      // under prefers-reduced-motion. Omitting it defers to the stylesheet.
      el.scrollIntoView?.({ block: "center" });
    }
  }, [focusRequestSeq]);

  // MEH-1489: the admin case is now handled by the early gate below (a terminal
  // "separate account for admin" screen), not a silent /admin redirect — same
  // intent as the auth.py:~477 403 backstop, surfaced up-front instead of at
  // submit. The producer case joins it (409 already_has_producer at submit).

  useEffect(() => {
    loadCategories();
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = parseDraft(saved, Date.now());
        if (!draft) {
          // MEH-1977: expired, garbage, or a shape we no longer understand.
          // Deleting is the point rather than the cleanup — a draft holding a
          // seller's name, phone and address should not sit on a shared
          // machine indefinitely just because nobody came back for it.
          localStorage.removeItem(DRAFT_KEY);
        } else {
          // MEH-1977: a pre-envelope draft has no recoverable age, so it is
          // grandfathered exactly once — re-written as v2 stamped now, after
          // which it expires normally. See parseDraft's LEGACY note for why
          // this beats deleting it.
          if (draft.restamp) {
            localStorage.setItem(DRAFT_KEY, packDraft(draft.form, null, Date.now()));
          } else if (draft.stripped) {
            // MEH-2915: the draft on disk still carries fields the form no
            // longer accepts. parseDraft keeps them out of `form`, which is
            // what the seller sees; this rewrite is what takes them off the
            // device, without waiting for her next keystroke, a dismiss, or
            // the 7-day expiry.
            //
            // Re-packed at the draft's ORIGINAL savedAt, never Date.now():
            // stamping it now would restart MEH-1977's expiry for a draft
            // nobody touched — the same defect the setAndSave no-op guard
            // below exists to prevent.
            localStorage.setItem(
              DRAFT_KEY,
              packDraft(draft.form, draft.step, draft.savedAt),
            );
          }
          // MEH-1769: hasDraftContent replaces the 3-field truthiness test. An
          // empty-storage visit never reaches here at all (getItem returns
          // null); a draft that exists but holds nothing the seller typed no
          // longer earns a banner promising a "מילוי קודם".
          if (hasDraftContent(draft.form)) setShowDraftBanner(true);
        }
      }
    } catch {}
  }, []);

  // MEH-22: admin-minted prefill token
  useEffect(() => {
    if (!prefillToken || prefillApplied) return;
    api
      .get(`/register/producer/prefill/${prefillToken}`)
      .then((r) => {
        const d = r.data || {};
        setForm((prev) => ({
          ...prev,
          producer_name: d.name ?? prev.producer_name,
          phone: d.phone ?? prev.phone,
        }));
        setPrefillApplied(true);
      })
      .catch(() => setPrefillApplied(true));
  }, [prefillToken, prefillApplied]);

  // MEH-1977: `step` is captured so a resumed draft can land where the seller
  // left off. It is written on every field change, so it tracks the frame the
  // keystroke happened on — not the furthest frame ever reached, which would
  // promise progress the form fields do not actually hold.
  const saveDraft = (updated, atStep) => {
    try {
      localStorage.setItem(DRAFT_KEY, packDraft(updated, atStep, Date.now()));
    } catch {}
  };

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = parseDraft(saved, Date.now());
        if (draft) {
          // MEH-2773: the route decides the kind, never the stored draft —
          // both routes share DRAFT_KEY, so a business draft restored on the
          // organizer link (or the reverse) must not switch the flow.
          setForm((prev) => ({ ...prev, ...draft.form, kind: routeKind }));
          // MEH-1977: only ever forward, and only where the seller can
          // actually finish from — see safeResumeStep for why a signed-out
          // resume must still cross the account frame.
          let hasToken = false;
          try { hasToken = Boolean(localStorage.getItem("token")); } catch {}
          const resumeAt = safeResumeStep(draft.step, hasToken);
          // MEH-2915: the draft no longer carries a phone and nothing
          // prefills one, so a resume onto CATEGORY or STORY would hand her a
          // frame she can complete and then bounce at submit — back to
          // DETAILS, onto a required field she never saw go empty
          // (CROSS_STEP_REQUIRED, the gate at the «הצטרפו» handler). Landing
          // on the frame that owns the missing field is the honest stop.
          const cappedResume =
            resumeAt && !validateIsraeliPhone(form.phone) ? STEP.DETAILS : resumeAt;
          // MEH-2460 (review #3711): an organizer never stands on CATEGORY —
          // neither as a resume target nor as the frame she was on when she
          // pressed «continue».
          const skipCategory = (s) => (routeIsOrganizer && s === STEP.CATEGORY ? STEP.STORY : s);
          if (cappedResume) setStep(skipCategory(cappedResume));
          else if (routeIsOrganizer) setStep(skipCategory);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // Bad JSON or storage disabled — clear and ignore.
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }
    setShowDraftBanner(false);
  };

  // MEH-1769: "לא" has to stay dismissed across a reload. showDraftBanner is
  // component state only, so hiding it left the stored draft intact and the
  // mount read above re-raised the banner on the very next load — the seller
  // could decline the same prompt indefinitely. Dropping the draft IS what
  // "no, don't continue the previous fill" means, and it keeps the decision in
  // the one key that already owns it instead of adding a second dismissed-flag
  // key that the next keystroke would immediately contradict.
  const dismissDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setShowDraftBanner(false);
  };

  // Functional updater + draft save in one step. Used for every field —
  // text inputs, checkboxes, multi-select category list — so draft
  // persistence covers all writes uniformly (previously only text inputs
  // hit saveDraft, so checkboxes/categories were silently lost on refresh).
  // saveDraft is called inside the updater; in React strict mode the
  // updater can run twice — localStorage writes are idempotent so the
  // duplicate write is harmless.
  const setAndSave = (updater) => {
    setForm((prev) => {
      const next = updater(prev);
      // MEH-2915: an updater that returns `prev` is a no-op — React bails out
      // of the render, and writing here would still re-stamp the envelope's
      // `savedAt`, restarting the 7-day expiry (MEH-1977) for a change that
      // never happened. `handleCityKnownChange` takes that branch every time a
      // late /cities response confirms the verdict it already had.
      if (next === prev) return prev;
      saveDraft(next, step);
      return next;
    });
  };

  // MEH-2241 chunk B: the async half of CitySearch's verdict — a /cities fetch
  // that resolves after the keystroke can turn "unknown" into "known" (or the
  // reverse) for the value still in the field. Only the flag moves; `city`
  // itself is untouched, so nothing keyed on the value re-fires.
  // Not memoised on purpose: setAndSave closes over the current `step` for the
  // draft write, and a []-deps callback would pin the first render's step.
  // Two things keep this loop-safe, and both are pinned by tests:
  //  1. CitySearch (chunk A) calls onKnownChange only when the verdict flips —
  //     __tests__/CitySearchQuery.test.jsx asserts toHaveBeenCalledTimes(1)
  //     across a fetch that flips it.
  //  2. Even an unconditional call with the SAME value is a no-op here: the
  //     updater returns `prev` unchanged, so React bails out with no render.
  // A re-render loop therefore needs chunk A to alternate verdicts on a fixed
  // value, which its own guard forbids.
  const handleCityKnownChange = (known) =>
    setAndSave((prev) => (prev.city_known === known ? prev : { ...prev, city_known: known }));

  // MEH-1807 (Baymard inline-validation): the message goes away the moment the
  // field is touched, not at the next gate — an error that outlives its cause
  // reads as "still broken" and is a documented abandonment driver.
  const clearFieldError = (field) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const requestFocus = (elementId) => {
    pendingFocusIdRef.current = elementId;
    setFocusRequestSeq((seq) => seq + 1);
  };

  // MEH-1807: run the CROSS_STEP_REQUIRED subset `candidates` against the
  // current form. Writes a message for each offender and drops the message for
  // each one that now passes, so a per-step gate never clears another step's
  // error. Returns the offenders in wizard order; caller decides where to go.
  //
  // `isSubmit` owns the bounce flag on BOTH edges, which is why it lives here
  // rather than at the call sites: adversarial review found the flag latching
  // true after a bounce with nothing ever lowering it, so the next per-step
  // block re-raised "הועברתם לשדה" having moved nobody. It read as
  // self-clearing because the summary also needs a non-empty fieldErrors —
  // the flag itself survived the fix that emptied it.
  const runRequiredGate = (candidates, { isSubmit = false } = {}) => {
    const offenders = candidates.filter((c) => c.isMissing(form));
    setFieldErrors((prev) => {
      const next = { ...prev };
      candidates.forEach((c) => {
        if (offenders.includes(c)) {
          const key = typeof c.messageKey === "function" ? c.messageKey(form) : c.messageKey;
          next[c.field] = t(`auth.register.producer.validation.${key}`);
        } else {
          delete next[c.field];
        }
      });
      return next;
    });
    setSubmitBounced(isSubmit && offenders.length > 0);
    if (offenders.length > 0) requestFocus(offenders[0].focusId);
    return offenders;
  };

  const set = (field) => (e) => {
    const value = e.target.value;
    // MEH-328 Chunk D: emailExistsSubmitError clear removed with the state.
    clearFieldError(field);
    setAndSave((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCategory = (id) => {
    // MEH-1807: same on-change clear as the text fields — picking anything
    // satisfies "at least one category", so the message must not survive it.
    clearFieldError("category_ids");
    setAndSave((prev) => ({
      ...prev,
      category_ids: prev.category_ids.includes(id)
        ? prev.category_ids.filter((c) => c !== id)
        : [...prev.category_ids, id],
    }));
    // MEH-952: any category change invalidates a prior "license required" block —
    // clear it so re-selecting a license-required category can't resurface the
    // error before the user clicks "next" again (the error <p> lives inside the
    // licenseRequired branch, which remounts on re-select with stale state).
    setLicenseRequiredError(false);
    // MEH-971 chunk 1: a category change also drops a prior license-pending
    // opt-in so the checkbox can't reappear pre-checked after toggling away
    // from and back to a license-required category (payload is already guarded
    // by licenseRequired, but the stale checked state would mislead).
    setLicensePending(false);
  };

  // MEH-328 Chunk C: handleEmailBlur removed. It called the deleted
  // /auth/email-exists oracle to warn before submit. Duplicate-attempt
  // email (Chunks A+B) now informs the legitimate owner out-of-band;
  // the non-upgrade 409 branch is removed entirely in Chunk D — collisions
  // return an identical 200 ack and step 3 renders the inbox-check UI.

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const body = {
        producer_name: form.producer_name,
        // MEH-532: description is optional on the backend (sanitize_text
        // strips/empty-string normalises); we still send what we have so the
        // story shows up on the producer page immediately after approval.
        description: form.description,
        short_description: form.short_description,
        phone: form.phone,
        // MEH-853: frame-01 (DETAILS) — sent on both registration + upgrade
        // paths (shared body above the !isUpgrade branch).
        city: form.city,
        // MEH-2460: an organizer has no address step — a stale value typed
        // before she toggled must not 422 on a field she can no longer see
        // (the server drops it for her anyway).
        address: isOrganizer ? null : form.address,
        // MEH-1808: sending these is what makes the "המיקום זוהה" confirmation
        // a true statement rather than a promise the payload breaks.
        lat: isOrganizer ? null : form.lat,
        lng: isOrganizer ? null : form.lng,
        // MEH-2460: kind decides the server's validation branch; an organizer
        // sends no categories (any it had selected before toggling are dropped).
        kind: form.kind,
        category_ids: isOrganizer ? [] : form.category_ids,
        // MEH-530: empty string normalises server-side to "missing" via
        // license_validation._normalize_license — safe to send unconditionally.
        // MEH-2773: an organizer is never asked for a license; a number
        // carried in by a shared business draft must not ride along.
        producer_license_number: isOrganizer ? "" : form.producer_license_number,
        // MEH-971 chunk 1: only true when a license-required category is
        // selected AND the opt-in box is checked (backend default False).
        license_pending: licenseRequired && licensePending,
        // MEH-1471: self-reported attribution, from the STORY-step dropdown.
        // MEH-2183 made it OPTIONAL — an unanswered dropdown sends "" and the
        // backend stores NULL. The free-text answer is sent only when "other"
        // is chosen (empty otherwise → NULL as well).
        referral_source: form.referral_source,
        referral_source_other:
          form.referral_source === "other" ? form.referral_source_other : "",
        primary_contact_method: "whatsapp",
        // MEH-759 (ADR-022 gate 2, Chunk C): the binding declaration (+ the
        // grower declaration when an agricultural category is selected) folds
        // into the single declaration_accepted bool the backend stamps. ToS
        // consent (agreedToTerms) is a separate gate enforced at submit.
        declaration_accepted:
          declarationConfirmed && (!farmerDeclarationRequired || farmerConfirmed),
        // MEH-2923: the grower line on its own, so the server can require and
        // record it apart from the licensing declaration.
        farmer_declaration_accepted: farmerDeclarationRequired && farmerConfirmed,
        // MEH-1995: the ToS consent the comment above calls "a separate gate
        // enforced at submit" — it was enforced and then discarded, reaching
        // no column. Sent now so users.terms_accepted_at + terms_version get
        // stamped. Distinct from declaration_accepted directly above: that is
        // the LICENSING declaration, recorded on the producer row.
        terms_accepted: agreedToTerms,
        // MEH-1838 chunk B: the delivery axis finally reaches the endpoint.
        // Chunk A (#2959) added all four to ProducerRegister (schemas.py:701-704);
        // until this line they were never sent — and Pydantic drops unknown
        // fields silently, so the form "succeeded" while every business landed
        // on the same default shape. That silence is why this needs a test that
        // reads the POST body, not one that asserts the request returned 200.
        // MEH-2640: computed from the one answer step 2 collects.
        // MEH-2773: an organizer is never asked, so a business answer carried
        // in by a shared draft must not ride along — send the default shape.
        ...fulfilmentBooleans(isOrganizer ? "" : form.fulfilment),
      };
      // Sent only when non-empty: a physical-only registration posts no empty
      // array (the card's own acceptance criterion) and the server default is
      // `[]` regardless. The router folds a non-empty list into delivery_areas
      // ROWS (auth.py:586-588) — the only store the consumer filter reads
      // (producer_listing.py:258). It never writes the legacy flat column of the
      // same name (auth.py:550).
      // MEH-2640: delivery_cities is no longer collected at registration —
      // the dashboard owns it. ProducerRegister defaults it to []
      // (schemas.py:960), so omitting it posts the same shape a
      // physical-only registration always did.
      // MEH-143: logged-in users upgrade; account fields not needed.
      if (!isUpgrade) {
        body.email = form.email;
        body.name = form.name;
        body.password = form.password;
      }
      const res = await api.post("/auth/register/producer", body);
      // MEH-328 Chunk D: branch on response shape rather than the frontend
      // `isUpgrade` flag — guards against a token expiring between mount
      // and submit (frontend would think upgrade, backend would have taken
      // the non-upgrade path).
      const isUpgradeResult = "access_token" in (res.data || {});
      setDidUpgrade(isUpgradeResult);
      // MEH-1814: claim the render BEFORE the role can flip. Must stay above
      // the refreshUser() await below — moving it after reintroduces the
      // window where the gate outranks the success screen.
      setSubmitted(true);
      if (isUpgradeResult) {
        // MEH-1815: the draft is dropped ONLY here, where a token proves the
        // server actually persisted the business. The non-upgrade ack is
        // anti-enumeration output (MEH-328): identical bytes whether the
        // email was free or already taken, so a 200 on that path does NOT
        // mean the Producer was written — on a collision the backend
        // discards it entirely. Clearing on every 200 is what silently ate
        // a full wizard fill. The draft now waits in localStorage and the
        // existing banner offers it back; "לא" still drops it (dismissDraft).
        localStorage.removeItem(DRAFT_KEY);
        // UPGRADE PATH (UNCHANGED post-MEH-328): store token, refresh
        // auth context, surface whatsapp_sent on step 3.
        localStorage.setItem("token", res.data.access_token);
        // MEH-287: default true for older servers that don't return the flag.
        setWhatsappSent(res.data.whatsapp_sent ?? true);
        // Refresh auth context so user.role reflects the upgrade immediately.
        await refreshUser();
      }
      // MEH-435: successful submit — the funnel conversion event.
      trackEvent("producer_register_submitted");
      // Non-upgrade: no token, no refreshUser. Step 3 renders the
      // inbox-check UI keyed on didUpgrade === false.
      setStep(STEP.CONFIRM);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      // MEH-435: submit failure — {step} is STORY at submit time (the wizard
      // step the error surfaced on).
      trackEvent("producer_register_error", { step: STEP_NAME[step] });
      // MEH-328: only upgrade path can return 409 post-refactor.
      // isUpgrade frontend flag is sufficient for this error branch
      // (non-upgrade 409 was removed in Chunk B).
      if (status === 409 && isUpgrade) {
        setError(t("auth.register.producer.errors.already_has_producer"));
      } else {
        // MEH-957: a 422 returns `detail` as an ARRAY of Pydantic error
        // objects; setting that into `error` rendered an array of objects as
        // a React child and white-screened the form. detailToMessage()
        // collapses string/array shapes to one sentence (null otherwise).
        setError(detailToMessage(detail) || t("auth.register.producer.errors.generic"));
      }
    } finally {
      setLoading(false);
    }
  };

  // Don't render the wizard/preflight until auth resolves. MEH-1489 broadened
  // the old `&& step === STEP.ACCOUNT` guard to all authLoading: a token-holder's
  // step initializes to DETAILS (line 88), so that guard didn't cover them and a
  // logged-in producer/admin briefly saw the join pitch before the gate. Showing
  // the existing loading text for every authLoading tick closes that flash;
  // guests are unaffected (they start at ACCOUNT, resolve immediately).
  if (authLoading) {
    return <BrandLoader label={t("auth.register.producer.loading")} className="max-w-2xl mx-auto px-4 py-12" />;
  }

  // MEH-1489: early auth-state gate. A logged-in producer already owns a page
  // (backend 409 already_has_producer at submit) and an admin must use a separate
  // account (backend 403, auth.py:~477) — both dead-end a 10-minute wizard. Show a
  // terminal screen up-front instead. Guests + logged-in consumers (MEH-143 upgrade
  // path, role !== producer/admin) fall through unchanged. Sits ABOVE the
  // showPreflight return so the wizard tree below stays byte-identical (MEH-132).
  //
  // MEH-1814: both gates are `!submitted`-guarded. MEH-1489 added them ABOVE
  // the wizard return without excluding the post-submit state, so on the
  // upgrade path refreshUser() (:593) flipped user.role to "producer" and this
  // early return then outranked the STEP.CONFIRM success screen (:1658) on
  // every subsequent render — a seller who had just finished the 10-minute
  // wizard was told "כבר יש לך עמוד עסק". Not a timing race: the gate sits
  // above the wizard return, so once the role flips there is no interleaving
  // in which the success screen renders at all.
  // The gates themselves are unchanged — a genuine mount-time visit by an
  // existing producer/admin still short-circuits before any form interaction,
  // because `submitted` is false until a submit has actually succeeded.
  if (!submitted && user?.role === "producer") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-surface rounded-md p-8 text-center" data-testid="register-producer-gate">
          <div className="mb-4 flex justify-center">
            <CheckCircle size={64} weight="fill" className="text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.producer.gate.producer_heading")}</h1>
          <p className="text-fg-muted mb-6">{t("auth.register.producer.gate.producer_body")}</p>
          {/* CTA reuses the account-menu dashboard label (single owner, no new key). */}
          <button
            onClick={() => router.push("/producer/dashboard")}
            className="border-2 border-primary-dark text-primary-dark bg-transparent px-6 py-3 rounded-full hover:bg-primary-dark hover:text-white transition font-medium text-sm"
          >
            {t("account.menu.dashboard")}
          </button>
        </div>
      </div>
    );
  }
  if (!submitted && user?.role === "admin") {
    // No dashboard CTA — an admin's daily-work account has no producer page to
    // manage; the message points them at creating a separate business account.
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-surface rounded-md p-8 text-center" data-testid="register-producer-gate-admin">
          <h1 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.producer.gate.admin_heading")}</h1>
          <p className="text-fg-muted">{t("auth.register.producer.gate.admin_body")}</p>
        </div>
      </div>
    );
  }

  // MEH-994: pre-flight screen before frame 01. Early return keeps the wizard
  // tree below byte-identical (functional-freeze, MEH-132). Hero h1+subtitle
  // are repeated here so the page identity doesn't jump when the CTA is
  // clicked. showAccountLine: upgrade users (and token-holders whose step
  // already initialized past ACCOUNT) never see the account-creation frame,
  // so the checklist must not promise it.
  // MEH-2565: below md the form sits on the page, not in a white card — the
  // card's padding plus the inner boxes cost ~60px of a 375px screen.
  if (showPreflight) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="md:bg-surface md:rounded-md md:p-8">
          <h1 data-testid="register-hero-heading" className="font-headline-lg text-3xl font-black text-text mb-2 text-center">{t("auth.register.producer.heading")}</h1>
          <p className="text-fg-muted text-center mb-4">{t("auth.register.producer.subtitle")}</p>
          <RegisterPreflight
            showAccountLine={!isUpgrade && step === STEP.ACCOUNT}
            // MEH-2773: business-only screen — the organizer route never
            // renders it, so the CTA starts exactly one flow.
            onStart={() => setShowPreflight(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="md:bg-surface md:rounded-md md:p-8">
        {/* MEH-960: hero pitch is wizard chrome — hide on CONFIRM so it doesn't
            double up with the success-screen heading. Mirrors the
            step < STEP.CONFIRM guard on the banners + stepper. */}
        {step < STEP.CONFIRM && (
          <>
            {/* MEH-2773: the organizer route has its own heading and line
                (copy approved by Sapir 06/11); the subtitle reuses the
                already-approved organizer_hint sentence. */}
            <h1 data-testid="register-hero-heading" className="font-headline-lg text-3xl font-black text-text mb-2 text-center">
              {t(routeIsOrganizer ? "auth.register.producer.organizer_heading" : "auth.register.producer.heading")}
            </h1>
            <p className="text-fg-muted text-center mb-4">
              {t(routeIsOrganizer ? "auth.register.producer.fields.organizer_hint" : "auth.register.producer.subtitle")}
            </p>
          </>
        )}

        {/* MEH-143: logged-in upgrade banner */}
        {isUpgrade && step < STEP.CONFIRM && (
          <div className="bg-green-50 border border-primary/30 rounded-md px-4 py-3 mb-4 text-sm text-text flex items-start gap-2">
            <Leaf size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="block">{t("auth.register.producer.upgrade_banner.connected_with", { email: user.email })}</span>
              <span className="block">{t("auth.register.producer.upgrade_banner.attached_to_account")}</span>
            </span>
          </div>
        )}

        {showDraftBanner && step < STEP.CONFIRM && (
          <div data-testid="register-draft-banner" className="bg-green-50 border border-primary/20 rounded-md px-4 py-3 mb-4 flex items-center justify-between text-sm">
            <span className="text-text">{t("auth.register.producer.draft.prompt")}</span>
            <div className="flex gap-3">
              <button data-testid="register-draft-continue" onClick={restoreDraft} className="text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{t("auth.register.producer.draft.continue")}</button>
              <button data-testid="register-draft-dismiss" onClick={dismissDraft} className="text-fg-muted hover:text-text">{t("auth.register.producer.draft.dismiss")}</button>
            </div>
          </div>
        )}

        {/* MEH-register-a11y (F5): each numeral now carries a text caption so the
            step is meaningful to screen readers and sighted users alike (a bare
            "01".."04" conveys nothing). aria-current + the color state move to the
            wrapper so the active step is announced together with its caption.
            Stepper is gated on !isUpgrade — upgrade users start at DETAILS and
            never see it, so there is no separate 3-step variant to render. */}
        {step < STEP.CONFIRM && !isUpgrade && (
          <div className="flex justify-center gap-4 mb-8">
            {[
              { s: STEP.ACCOUNT, caption: t("auth.register.producer.step_captions.account") },
              { s: STEP.DETAILS, caption: t(isOrganizer ? "auth.register.producer.step_captions.details_organizer" : "auth.register.producer.step_captions.details") },
              { s: STEP.CATEGORY, caption: t("auth.register.producer.step_captions.category") },
              { s: STEP.STORY, caption: t("auth.register.producer.step_captions.story") },
            ]
              // MEH-2460: an organizer never visits CATEGORY, so it is not a step.
              .filter(({ s }) => !(isOrganizer && s === STEP.CATEGORY))
              .map(({ s, caption }) => (
              <div
                key={s}
                aria-current={s === step ? "step" : undefined}
                className={`flex flex-col items-center gap-1 ${s <= step ? "text-accent" : "text-fg-muted"}`}
              >
                <span dir="ltr" className="font-english italic text-2xl leading-none">
                  {String(s).padStart(2, "0")}
                </span>
                <span className="text-xs font-medium leading-none">{caption}</span>
              </div>
            ))}
          </div>
        )}

        {/* MEH-1807: the bounce explanation (GOV.UK error summary). It sits at
            the TOP of the wizard card, not next to "הצטרפו" as MEH-1807's AC
            worded it, because the same click that raises it also leaves the
            STORY frame — a notice rendered beside that button can never be on
            screen when it matters, and an unreachable branch is the defect class
            .claude/rules/testing.md documents ("passed identically on the broken
            and the fixed page"). Top-of-form is also GOV.UK's own position for
            the summary the AC cites. Shown only after a SUBMIT bounce: a
            per-step block moves nobody, so "הועברתם לשדה" would be false there.
            Derived from fieldErrors, so it clears itself as the fields are fixed. */}
        {submitBounced && crossStepErrors.length > 0 && step < STEP.CONFIRM && (
          <div
            role="alert"
            data-testid="register-submit-gate-notice"
            className="border border-error/30 rounded-md px-4 py-3 mb-4 text-sm text-error text-start"
          >
            {crossStepErrors.length === 1 ? (
              <p>{t("auth.register.producer.validation.cross_step_notice")}</p>
            ) : (
              <>
                <p>{t("auth.register.producer.validation.cross_step_summary")}</p>
                <ul className="list-disc ms-5 mt-1">
                  {crossStepErrors.map(([field, message]) => (
                    <li key={field}>{message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* MEH-3026 (F10): the notice is about the form; once it is sent there is no form. */}
        {prefillToken && prefillApplied && !submitted && (
          <div className="bg-green-50 text-primary border border-primary/30 rounded-md p-3 mb-4 text-sm inline-flex items-center gap-2">
            <Leaf size={16} aria-hidden="true" className="shrink-0" />
            {t("auth.register.producer.prefill_notice")}
          </div>
        )}

        {/* Step 1: Account */}
        {step === STEP.ACCOUNT && (
          <AccountStep
            form={form}
            refreshUser={refreshUser}
            requestFocus={requestFocus}
            routePath={routePath}
            router={router}
            set={set}
            setStep={setStep}
            setStepError={setStepError}
            stepError={stepError}
            t={t}
          />
        )}

        {/* Step 2: Business basics */}
        {step === STEP.DETAILS && (
          <DetailsStep
            clearFieldError={clearFieldError}
            fieldErrors={fieldErrors}
            form={form}
            fulfilment={fulfilment}
            fulfilmentError={fulfilmentError}
            handleCityKnownChange={handleCityKnownChange}
            isOrganizer={isOrganizer}
            isUpgrade={isUpgrade}
            phoneErrorMessage={phoneErrorMessage}
            runRequiredGate={runRequiredGate}
            set={set}
            setAndSave={setAndSave}
            setError={setError}
            setFulfilmentError={setFulfilmentError}
            setStep={setStep}
            setStepError={setStepError}
            t={t}
          />
        )}

        {step === STEP.CATEGORY && (
          <CategoryStep
            categories={categories}
            categoriesFailed={categoriesFailed}
            fieldErrors={fieldErrors}
            form={form}
            licenseOptionalExpanded={licenseOptionalExpanded}
            licensePending={licensePending}
            licenseRequired={licenseRequired}
            licenseRequiredError={licenseRequiredError}
            licenseWarning={licenseWarning}
            loadCategories={loadCategories}
            requestFocus={requestFocus}
            runRequiredGate={runRequiredGate}
            set={set}
            setAndSave={setAndSave}
            setError={setError}
            setLicenseOptionalExpanded={setLicenseOptionalExpanded}
            setLicensePending={setLicensePending}
            setLicenseRequiredError={setLicenseRequiredError}
            setShowCategoryModal={setShowCategoryModal}
            setStep={setStep}
            setStepError={setStepError}
            t={t}
            toggleCategory={toggleCategory}
          />
        )}

        {step === STEP.STORY && (
          <StoryStep
            agreedToTerms={agreedToTerms}
            categories={categories}
            declarationConfirmed={declarationConfirmed}
            descriptionBeforeDisableRef={descriptionBeforeDisableRef}
            descriptionDisabled={descriptionDisabled}
            descriptionPlaceholder={descriptionPlaceholder}
            error={error}
            farmerConfirmed={farmerConfirmed}
            farmerDeclarationRequired={farmerDeclarationRequired}
            form={form}
            handleSubmit={handleSubmit}
            isOrganizer={isOrganizer}
            loading={loading}
            runRequiredGate={runRequiredGate}
            set={set}
            setAgreedToTerms={setAgreedToTerms}
            setAndSave={setAndSave}
            setDeclarationConfirmed={setDeclarationConfirmed}
            setDescriptionDisabled={setDescriptionDisabled}
            setError={setError}
            setFarmerConfirmed={setFarmerConfirmed}
            setStep={setStep}
            setStepError={setStepError}
            t={t}
          />
        )}

      <CategoryRequestModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        producerId={null}
      />

        {/* Step 3: Confirmation */}
        {/* MEH-328 Chunk D: step 3 splits on didUpgrade. Upgrade path
            (authenticated user added producer to account) keeps the
            existing "הצטרפת!" success UI with token-backed dashboard CTA.
            Non-upgrade path renders the OWASP-aligned inbox-check screen
            — identical body across new-email / collision branches. */}
        {step === STEP.CONFIRM && didUpgrade && (
          <ConfirmUpgradedStep
            router={router}
            shareRegisterInvite={shareRegisterInvite}
            t={t}
            whatsappSent={whatsappSent}
          />
        )}
        {step === STEP.CONFIRM && !didUpgrade && (
          <ConfirmInboxStep
            router={router}
            t={t}
          />
        )}
      </div>
    </div>
  );
}
