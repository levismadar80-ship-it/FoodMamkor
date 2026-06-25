"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle, EnvelopeSimple, Leaf, WhatsappLogo, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
import CategoryRequestModal from "@/components/CategoryRequestModal";
import CategorySelector from "@/components/CategorySelector";
import CitySearch from "@/components/CitySearch";
import PasswordStrength from "@/components/PasswordStrength";
import ProducerOAuthButtons from "@/components/ProducerOAuthButtons";
import { passwordValid, validateIsraeliPhone, validateEmail } from "@/lib/validators";
import { useAuth } from "@/lib/auth-context";
import { getSeasonalPlaceholder } from "@/lib/producer-description-placeholders";
import {
  hasLicenseFormatWarning,
  requiresProducerLicense,
} from "@/lib/license-required-categories";

const DRAFT_KEY = "producer_registration_draft";
// MEH-847 (S7 Chunk B): wizard step enum — single source for the 3→5 re-index.
const STEP = { ACCOUNT: 1, DETAILS: 2, CATEGORY: 3, STORY: 4, CONFIRM: 5 };
// MEH-532: surfaces a dashboard reminder for sellers who deferred their story.
const DESCRIPTION_PENDING_KEY = "description_pending";
// MEH-759 Chunk C (ADR-022 gate 2): agricultural categories that trigger the
// conditional grower declaration ("תוצרת שגידלתי בחלקתי בלבד"). Hebrew NAMES
// (IDs are seed-ordering-dependent) — must match backend/seed_data.py:15-16.
const FARMER_DECLARATION_CATEGORIES = ["ירקות", "פירות"];

const EMPTY_FORM = {
  email: "", name: "", password: "",
  producer_name: "", description: "", phone: "",
  city: "", address: "",
  short_description: "",
  category_ids: [],
  // MEH-530: optional at the form level. Backend 422s when any selected
  // category requires a license and this is empty — helper at
  // backend/app/services/license_validation.py.
  producer_license_number: "",
};

function RegisterProducerPageFallback() {
  const t = useTranslations();
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center text-fg-muted">
      {t("auth.register.producer.loading_form")}
    </div>
  );
}

export default function RegisterProducerPage() {
  return (
    <Suspense fallback={<RegisterProducerPageFallback />}>
      <RegisterProducerPageBody />
    </Suspense>
  );
}

function RegisterProducerPageBody() {
  const t = useTranslations();
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
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stepError, setStepError] = useState("");
  // MEH-952: blocking error shown next to the license field on CATEGORY when a
  // license-required category is selected but the number is blank — surfaces the
  // requirement at the field instead of letting the backend 422 land on STORY.
  // The backend check in license_validation.py stays the unchanged backstop.
  const [licenseRequiredError, setLicenseRequiredError] = useState(false);
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
  const licenseRequired = requiresProducerLicense(categories, form.category_ids);
  const licenseWarning = hasLicenseFormatWarning(form.producer_license_number);
  // MEH-759 Chunk C: the grower declaration line is shown (and required) only
  // for the two agricultural categories. Name-match mirrors requiresProducerLicense
  // (IDs are seed-ordering-dependent; names are stable). Source: seed_data.py:15-16.
  const farmerDeclarationRequired = categories
    .filter((c) => form.category_ids.includes(c.id))
    .some((c) => FARMER_DECLARATION_CATEGORIES.includes(c.name));

  // Sync step when auth resolves (user may load after initial render).
  useEffect(() => {
    if (isUpgrade && step === STEP.ACCOUNT) setStep(STEP.DETAILS);
  }, [isUpgrade]); // eslint-disable-line react-hooks/exhaustive-deps

  // MEH-669: admins cannot register as producers. Backend rejects with
  // 403 at auth.py:432; this redirect prevents them from filling out the
  // form only to hit a server error on submit. Wait for auth to resolve
  // so we don't bounce mid-load while user is still null.
  useEffect(() => {
    if (!authLoading && user?.role === "admin") router.push("/admin");
  }, [authLoading, user, router]);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.producer_name || parsed.name || parsed.email) setShowDraftBanner(true);
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

  const saveDraft = (updated) => {
    try {
      const { password, ...safe } = updated;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
    } catch {}
  };

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate shape — reject anything that isn't a plain object,
        // or that has a non-array category_ids. Drop garbage drafts so
        // we don't merge stale schemas (e.g. from before category_ids
        // existed) into form state.
        const shapeOk =
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed.category_ids === undefined || Array.isArray(parsed.category_ids));
        if (shapeOk) {
          setForm((prev) => ({ ...prev, ...parsed }));
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
      saveDraft(next);
      return next;
    });
  };

  const set = (field) => (e) => {
    const value = e.target.value;
    // MEH-328 Chunk D: emailExistsSubmitError clear removed with the state.
    setAndSave((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCategory = (id) => {
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
        address: form.address,
        category_ids: form.category_ids,
        // MEH-530: empty string normalises server-side to "missing" via
        // license_validation._normalize_license — safe to send unconditionally.
        producer_license_number: form.producer_license_number,
        primary_contact_method: "whatsapp",
        // MEH-759 (ADR-022 gate 2, Chunk C): the binding declaration (+ the
        // grower declaration when an agricultural category is selected) folds
        // into the single declaration_accepted bool the backend stamps. ToS
        // consent (agreedToTerms) is a separate gate enforced at submit.
        declaration_accepted:
          declarationConfirmed && (!farmerDeclarationRequired || farmerConfirmed),
      };
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
      localStorage.removeItem(DRAFT_KEY);
      if (isUpgradeResult) {
        // UPGRADE PATH (UNCHANGED post-MEH-328): store token, refresh
        // auth context, surface whatsapp_sent on step 3.
        localStorage.setItem("token", res.data.access_token);
        // MEH-287: default true for older servers that don't return the flag.
        setWhatsappSent(res.data.whatsapp_sent ?? true);
        // Refresh auth context so user.role reflects the upgrade immediately.
        await refreshUser();
      }
      // Non-upgrade: no token, no refreshUser. Step 3 renders the
      // inbox-check UI keyed on didUpgrade === false.
      setStep(STEP.CONFIRM);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      // MEH-328: only upgrade path can return 409 post-refactor.
      // isUpgrade frontend flag is sufficient for this error branch
      // (non-upgrade 409 was removed in Chunk B).
      if (status === 409 && isUpgrade) {
        setError(t("auth.register.producer.errors.already_has_producer"));
      } else {
        setError(detail || t("auth.register.producer.errors.generic"));
      }
    } finally {
      setLoading(false);
    }
  };

  // Don't show step 1 (account form) until we know whether user is logged in —
  // prevents the flash of email/password inputs for already-authenticated users.
  if (authLoading && step === STEP.ACCOUNT) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-fg-muted">{t("auth.register.producer.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="bg-white rounded-md p-8">
        <h1 className="font-headline-lg text-3xl font-black text-text mb-2 text-center">{t("auth.register.producer.heading")}</h1>
        <p className="text-fg-muted text-center mb-4">{t("auth.register.producer.subtitle")}</p>

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
          <div className="bg-green-50 border border-primary/20 rounded-md px-4 py-3 mb-4 flex items-center justify-between text-sm">
            <span className="text-text">{t("auth.register.producer.draft.prompt")}</span>
            <div className="flex gap-3">
              <button onClick={restoreDraft} className="text-primary font-medium hover:underline">{t("auth.register.producer.draft.continue")}</button>
              <button onClick={() => setShowDraftBanner(false)} className="text-fg-muted hover:text-text">{t("auth.register.producer.draft.dismiss")}</button>
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
              { s: STEP.DETAILS, caption: t("auth.register.producer.step_captions.details") },
              { s: STEP.CATEGORY, caption: t("auth.register.producer.step_captions.category") },
              { s: STEP.STORY, caption: t("auth.register.producer.step_captions.story") },
            ].map(({ s, caption }) => (
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

        {prefillToken && prefillApplied && (
          <div className="bg-green-50 text-primary border border-primary/30 rounded-md p-3 mb-4 text-sm inline-flex items-center gap-2">
            <Leaf size={16} aria-hidden="true" className="shrink-0" />
            {t("auth.register.producer.prefill_notice")}
          </div>
        )}

        {/* Step 1: Account */}
        {step === STEP.ACCOUNT && (
          <div className="space-y-4" data-testid="register-frame-account">
            <h2 className="font-headline-md text-lg font-black">{t("auth.register.producer.steps.account.title")}</h2>

            {/* MEH-880 (S7 Chunk E1): copy-only reassurance card — mirrors the
                Chunk-D story_card pattern (brand tokens only, no state-color). */}
            <div className="bg-background border border-primary/20 rounded-md px-4 py-3 text-sm" data-testid="register-account-reassurance">
              <p className="text-text text-start">{t("auth.register.producer.account_reassurance")}</p>
            </div>

            {/* MEH-170 — Step 0 OAuth on top. Unmounts gracefully when
                no Google/Apple client_id is configured. */}
            <ProducerOAuthButtons
              onSuccess={async () => {
                await refreshUser();
                setStep(STEP.DETAILS);
              }}
              onError={(msg, meta) => {
                if (meta?.redirectToLogin) {
                  router.push(`/login?redirect=${encodeURIComponent("/register/producer")}`);
                  return;
                }
                setStepError(msg);
              }}
            />

            <h3 className="text-sm font-medium text-fg-muted pt-2">{t("auth.register.producer.steps.account.email_section")}</h3>

            {/* MEH-register-a11y (F4): the account/details inputs were
                placeholder-only — no persistent label. Each now gets a visible
                <label htmlFor> (the *_label key carries the "*"); the *.fields.<x>
                key is repurposed as an example placeholder. required attr added.
                (F3): min-h-[44px] enforces the WCAG 2.5.5 touch-target floor,
                matching CitySearch.jsx:118. */}
            <div>
              <label htmlFor="producer-account-name" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.name_label")}
              </label>
              <input
                id="producer-account-name"
                data-testid="register-account-name"
                placeholder={t("auth.register.producer.fields.name")}
                value={form.name}
                onChange={set("name")}
                required
                className="w-full border rounded-md ps-3 pe-3 py-2 min-h-[44px] text-start"
                dir="rtl"
              />
            </div>
            <div>
              <label htmlFor="producer-account-email" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.email_label")}
              </label>
              <input
                id="producer-account-email"
                type="email"
                data-testid="register-account-email"
                placeholder={t("auth.register.producer.fields.email")}
                value={form.email}
                onChange={set("email")}
                required
                className="w-full border rounded-md px-3 py-2 min-h-[44px]"
                dir="ltr"
              />
            </div>
            {/* MEH-328 Chunk C: emailExistsWarning render block removed
                with handleEmailBlur. emailExistsSubmitError block below
                (rendered on 409 from submit) is preserved by Chunk D. */}
            <div>
              <label htmlFor="producer-account-password" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.password_label")}
              </label>
              <input
                id="producer-account-password"
                type="password"
                data-testid="register-account-password"
                placeholder={t("auth.register.producer.fields.password")}
                value={form.password}
                onChange={set("password")}
                required
                className="w-full border rounded-md px-3 py-2 min-h-[44px]"
                dir="ltr"
                minLength={12}
              />
              <PasswordStrength password={form.password} />
            </div>
            {stepError && <p role="alert" className="text-red-500 text-sm">{stepError}</p>}
            <button
              data-testid="register-account-next"
              onClick={() => {
                if (!form.name || !form.email || !form.password) {
                  setStepError(t("auth.register.producer.validation.all_required"));
                  return;
                }
                if (!validateEmail(form.email)) {
                  setStepError(t("auth.register.producer.validation.email_invalid"));
                  return;
                }
                if (!passwordValid(form.password)) {
                  setStepError(t("auth.register.producer.validation.password_complexity"));
                  return;
                }
                setStepError("");
                setStep(STEP.DETAILS);
              }}
              className="w-full border-2 border-primary-dark text-primary-dark bg-transparent py-3 rounded-md hover:bg-primary-dark hover:text-white transition"
            >
              {t("auth.register.producer.actions.next")}
            </button>
          </div>
        )}

        {/* Step 2: Business basics */}
        {step === STEP.DETAILS && (
          <div className="space-y-4" data-testid="register-frame-details">
            <h2 className="font-headline-md text-lg font-black">{t("auth.register.producer.steps.business.title")}</h2>
            <p className="text-sm text-fg-muted">
              {t("auth.register.producer.steps.business.subtitle")}
            </p>

            <div>
              <label htmlFor="producer-business-name" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.producer_name_label")}
              </label>
              <input
                id="producer-business-name"
                data-testid="register-details-name"
                placeholder={t("auth.register.producer.fields.producer_name")}
                value={form.producer_name}
                onChange={set("producer_name")}
                required
                className="w-full border rounded-md ps-3 pe-3 py-2 min-h-[44px] text-start"
                dir="rtl"
              />
            </div>

            <div>
              <label htmlFor="producer-phone" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.phone_label")}
              </label>
              <input
                id="producer-phone"
                data-testid="register-details-phone"
                placeholder={t("auth.register.producer.fields.phone")}
                value={form.phone}
                onChange={set("phone")}
                required
                aria-invalid={form.phone && !validateIsraeliPhone(form.phone) ? "true" : undefined}
                aria-describedby={form.phone && !validateIsraeliPhone(form.phone) ? "register-phone-error" : undefined}
                className={`w-full border rounded-md px-3 py-2 min-h-[44px] ${
                  form.phone && !validateIsraeliPhone(form.phone) ? "border-red-400" : ""
                }`}
                dir="ltr"
              />
              {form.phone && !validateIsraeliPhone(form.phone) && (
                <p id="register-phone-error" className="text-xs text-red-500 mt-1 inline-flex items-center gap-1"><X size={14} className="text-current" />{t("auth.register.producer.validation.phone_invalid")}</p>
              )}
              {form.phone && validateIsraeliPhone(form.phone) && (
                <p className="text-xs text-primary mt-1">{t("auth.register.producer.validation.phone_valid")}</p>
              )}
              <p className="text-xs text-fg-muted mt-1">
                {t("auth.register.producer.fields.phone_hint")}
              </p>
            </div>

            {/* MEH-853: frame-01 city — reuses the MEH-201 CitySearch
                autocomplete (MEH-213: free-text city forbidden). CitySearch
                emits a string, so it can't use the event-based set() helper. */}
            <div data-testid="register-details-city">
            <CitySearch
              id="producer-city"
              label={t("auth.register.producer.fields.city")}
              placeholder={t("auth.register.producer.fields.city")}
              value={form.city}
              onChange={(v) => setAndSave((prev) => ({ ...prev, city: v }))}
            />
            {/* MEH-951: visual-only required marker — no submit-gating change. */}
            <p className="text-xs text-fg-muted mt-1 text-start">
              {t("auth.register.producer.fields.city_required_marker")}
            </p>
            </div>

            {/* address is optional (no "*", not gated at submit) — label carries
                no asterisk and the input gets no required attr. */}
            <div>
              <label htmlFor="producer-address" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.address_label")}
              </label>
              <input
                id="producer-address"
                data-testid="register-details-address"
                placeholder={t("auth.register.producer.fields.address")}
                value={form.address}
                onChange={set("address")}
                className="w-full border rounded-md ps-3 pe-3 py-2 min-h-[44px] text-start"
                dir="rtl"
              />
              {/* MEH-951: map-privacy reassurance under the address field. */}
              <p className="text-xs text-fg-muted mt-1 text-start">
                {t("auth.register.producer.fields.address_map_privacy_hint")}
              </p>
            </div>

            <div className="flex gap-3">
              {!isUpgrade && (
                <button data-testid="register-details-back" onClick={() => { setStepError(""); setError(""); setStep(STEP.ACCOUNT); }} className="text-muted">{t("auth.register.producer.actions.back")}</button>
              )}
              <button
                data-testid="register-details-next"
                onClick={() => setStep(STEP.CATEGORY)}
                className="flex-1 border-2 border-primary-dark text-primary-dark bg-transparent py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium"
              >
                {t("auth.register.producer.actions.next")}
              </button>
            </div>
          </div>
        )}

        {step === STEP.CATEGORY && (
          <div className="space-y-4" data-testid="register-frame-category">
            <h2 className="font-headline-md text-lg font-black">{t("auth.register.producer.steps.category.title")}</h2>
            <CategorySelector
              categories={categories}
              selectedIds={form.category_ids}
              onChange={toggleCategory}
              onRequestCategory={() => setShowCategoryModal(true)}
            />

            {/* MEH-293: dietary labels moved to per-product (frontend/app/settings/page.jsx ProductsSection). */}

            {/* MEH-530: conditional license field. Backend enforces the
                requirement via ensure_license_for_categories — this block
                is the matching UX. Required path renders inline with the
                "(חובה)" suffix; optional path is collapsed behind a toggle
                so the field doesn't add visual weight to producers who
                don't need it (vegetables, eggs, etc.). Format warning is
                inline + non-blocking per MEH-530 product decision (Sapir
                manual-approval flow). */}
            {licenseRequired ? (
              <div>
                <label
                  htmlFor="producer-license-required"
                  className="block text-sm font-medium text-text mb-1 text-start"
                >
                  {t("auth.register.producer.fields.license_required_label")}
                </label>
                <p className="text-xs text-fg-muted mb-2 text-start">
                  {t("auth.register.producer.fields.license_required_hint")}
                </p>
                {/* MEH-951: "what is this" extension after the required hint. */}
                <p className="text-xs text-fg-muted mb-2 text-start">
                  {t("auth.register.producer.fields.license_what_is_it")}
                </p>
                <input
                  id="producer-license-required"
                  data-testid="register-category-license"
                  value={form.producer_license_number}
                  // MEH-952: clear the blocking required-error as soon as the
                  // user starts entering a number (avoids a stale red message).
                  onChange={(e) => {
                    set("producer_license_number")(e);
                    if (licenseRequiredError) setLicenseRequiredError(false);
                  }}
                  maxLength={20}
                  inputMode="numeric"
                  // text-right kept: dir="ltr" numeric license — physical right = start side in the RTL form; logical text-start would follow the field's own ltr direction instead
                  className="w-full border rounded-md ps-3 pe-3 py-2 min-h-[44px] text-right"
                  dir="ltr"
                />
                {licenseWarning && (
                  <p className="text-xs text-fg-muted mt-1 text-start">
                    {t("auth.register.producer.validation.license_format")}
                  </p>
                )}
                {/* MEH-952: blocking required-error — validation-red (distinct
                    from the gray, non-blocking format warning above). role=alert
                    announces it; mirrors the inline phone-error placement. */}
                {licenseRequiredError && (
                  <p role="alert" className="text-xs text-red-500 mt-1 text-start">
                    {t("auth.register.producer.validation.license_required")}
                  </p>
                )}
              </div>
            ) : licenseOptionalExpanded ? (
              <div className="relative">
                {/* MEH-619: close button collapses the optional license input
                    back to the "יש לי רישיון יצרן ↓" link AND clears any
                    half-typed value so it doesn't submit silently. Positioned
                    at the top-end (RTL-aware: end-0 = left edge in he) via
                    logical properties. licenseRequired === true path above
                    is intentionally NOT given this button — it's mandatory
                    by category and must not be collapsible. */}
                <button
                  type="button"
                  onClick={() => {
                    setAndSave((prev) => ({ ...prev, producer_license_number: "" }));
                    setLicenseOptionalExpanded(false);
                  }}
                  aria-label={t("auth.register.producer.actions.close")}
                  className="absolute top-0 end-0 text-fg-muted hover:text-text leading-none p-1"
                >
                  <X size={18} />
                </button>
                <label
                  htmlFor="producer-license-optional"
                  className="block text-sm font-medium text-text mb-1 text-start"
                >
                  {t("auth.register.producer.fields.license_optional_label")}
                </label>
                <input
                  id="producer-license-optional"
                  value={form.producer_license_number}
                  onChange={set("producer_license_number")}
                  maxLength={20}
                  inputMode="numeric"
                  // text-right kept: dir="ltr" numeric license — physical right = start side in the RTL form; logical text-start would follow the field's own ltr direction instead
                  className="w-full border rounded-md ps-3 pe-3 py-2 min-h-[44px] text-right"
                  dir="ltr"
                />
                {licenseWarning && (
                  <p className="text-xs text-fg-muted mt-1 text-start">
                    {t("auth.register.producer.validation.license_format")}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLicenseOptionalExpanded(true)}
                // F7 (register polish): py-3.5 lifts the tap target to ≥44px (text-xs 16px + 2×14px) without changing the visible text size.
                className="text-xs text-primary underline hover:text-primary-dark text-start py-3.5"
              >
                {t("auth.register.producer.actions.add_license")}
              </button>
            )}

            <div className="flex gap-3">
              <button data-testid="register-category-back" onClick={() => { setStepError(""); setError(""); setLicenseRequiredError(false); setStep(STEP.DETAILS); }} className="text-muted">{t("auth.register.producer.actions.back")}</button>
              <button
                data-testid="register-category-next"
                onClick={() => {
                  // MEH-952: block advance when a license-required category is
                  // selected but the number is blank; show the error at the field.
                  if (licenseRequired && !form.producer_license_number.trim()) {
                    setLicenseRequiredError(true);
                    return;
                  }
                  setLicenseRequiredError(false);
                  setStep(STEP.STORY);
                }}
                className="flex-1 border-2 border-primary-dark text-primary-dark bg-transparent py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium"
              >
                {t("auth.register.producer.actions.next")}
              </button>
            </div>
          </div>
        )}

        {step === STEP.STORY && (
          <div className="space-y-4" data-testid="register-frame-story">
            <h2 className="font-headline-md text-lg font-black">{t("auth.register.producer.steps.story.title")}</h2>
            {/* MEH-860: frame-03 tagline (short_description) — the one-line
                "dek" above the long story. Plain text input (event-based
                set(), like address); the long description below is byte-identical. */}
            <div>
              <label
                htmlFor="producer-tagline"
                className="block text-sm font-medium text-text mb-1 text-start"
              >
                {t("auth.register.producer.fields.tagline_label")}
              </label>
              <input
                id="producer-tagline"
                data-testid="register-story-tagline"
                value={form.short_description}
                onChange={set("short_description")}
                maxLength={160}
                placeholder={t("auth.register.producer.fields.tagline_placeholder")}
                className="w-full border rounded-md ps-3 pe-3 py-2 min-h-[44px] text-start"
                dir="rtl"
              />
              <p className="text-xs text-fg-muted mt-1">{form.short_description.length}/160</p>
            </div>

            {/* MEH-860: copy-only reassurance card — frames the magazine thesis
                (the story becomes the producer's page). No logic, no preview. */}
            <div className="bg-background border border-primary/20 rounded-md px-4 py-3 text-sm">
              <p className="font-medium text-text mb-1 text-start">{t("auth.register.producer.story_card.title")}</p>
              <p className="text-fg-muted text-start leading-relaxed">{t("auth.register.producer.story_card.body")}</p>
            </div>

            {/* MEH-914: photo-to-publish disclosure (copy only). Gate: admin.py:442. */}
            <p data-testid="photo-disclosure-story" className="text-xs text-fg-muted text-start leading-relaxed">{t("auth.register.producer.photo_disclosure")}</p>

            {/* MEH-532: description is moved to the prominent slot directly
                below the business name. Submit is never blocked on it —
                the "אני אכתוב אחר כך" link fills a default and disables the
                textarea so motivated sellers add a real story while everyone
                else still ships. localStorage flag surfaces a future
                dashboard reminder. */}
            <div>
              <label
                htmlFor="producer-description"
                className="block text-sm font-medium text-text mb-1 text-start"
              >
                {t("auth.register.producer.fields.description_label")}
              </label>
              <p className="text-xs text-fg-muted mb-2 text-start">
                {t("auth.register.producer.fields.description_hint")}
              </p>
              <textarea
                id="producer-description"
                value={form.description}
                onChange={set("description")}
                disabled={descriptionDisabled}
                placeholder={descriptionPlaceholder}
                rows={6}
                className="w-full border rounded-md ps-3 pe-3 py-2 text-start min-h-[9rem] md:min-h-[12rem] disabled:bg-green-50 disabled:text-fg-muted disabled:cursor-not-allowed"
                dir="rtl"
              />
              {!descriptionDisabled ? (
                <button
                  type="button"
                  onClick={() => {
                    // MEH-619: snapshot pre-click text so the matching
                    // "ערוך תיאור" undo link can restore it.
                    descriptionBeforeDisableRef.current = form.description || "";
                    setAndSave((prev) => ({ ...prev, description: t("auth.register.producer.default_description") }));
                    setDescriptionDisabled(true);
                    try {
                      localStorage.setItem(DESCRIPTION_PENDING_KEY, "true");
                    } catch {
                      // private browsing / storage disabled — flag is best-effort
                    }
                  }}
                  className="text-xs text-primary underline mt-1 hover:text-primary-dark"
                >
                  {t("auth.register.producer.actions.write_later")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // MEH-619: restore the pre-click description, re-enable
                    // the textarea, drop the pending-flag so a future
                    // dashboard-reminder surface doesn't treat this as still
                    // pending. setAndSave persists the restored text back to
                    // the localStorage draft in the same write.
                    setAndSave((prev) => ({
                      ...prev,
                      description: descriptionBeforeDisableRef.current,
                    }));
                    setDescriptionDisabled(false);
                    try {
                      localStorage.removeItem(DESCRIPTION_PENDING_KEY);
                    } catch {
                      // private browsing / storage disabled — best-effort
                    }
                  }}
                  className="text-xs text-primary underline mt-1 hover:text-primary-dark"
                >
                  {t("auth.register.producer.actions.edit_description")}
                </button>
              )}
            </div>

            {/* MEH-759 Chunk C: three separate affirmative acts — ToS/privacy
                consent (chrome, plural), the binding licensing declaration
                (first-person), and the conditional grower declaration. ADR-014
                voice separation; each locked string is its own verbatim key. */}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
                required
              />
              <span className="leading-relaxed text-fg-muted">
                {t("auth.register.producer.terms.intro")}{" "}
                <a href="/terms" target="_blank" className="text-primary hover:underline">{t("auth.register.producer.terms.tos_link")}</a>{" "}
                {t("auth.register.producer.terms.and")}<a href="/privacy" target="_blank" className="text-primary hover:underline">{t("auth.register.producer.terms.privacy_link")}</a>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={declarationConfirmed}
                onChange={(e) => setDeclarationConfirmed(e.target.checked)}
                className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
                required
              />
              <span className="leading-relaxed text-fg-muted">
                {t("auth.register.producer.terms.declaration")}
              </span>
            </label>

            {farmerDeclarationRequired && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={farmerConfirmed}
                  onChange={(e) => setFarmerConfirmed(e.target.checked)}
                  className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
                  required
                />
                <span className="leading-relaxed text-fg-muted">
                  {t("auth.register.producer.terms.farmer_declaration")}
                </span>
              </label>
            )}

            {/* MEH-328 Chunk D: emailExistsSubmitError render block removed.
                Non-upgrade collisions return identical 200 ack → step 3
                inbox-check UI. Upgrade-path 409 still surfaces via `error`. */}
            {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button data-testid="register-story-back" onClick={() => { setStepError(""); setError(""); setStep(STEP.CATEGORY); }} className="text-muted">{t("auth.register.producer.actions.back")}</button>
              <button
                data-testid="register-story-submit"
                onClick={() => {
                  // Clear stale error first so the next failure renders a
                  // visible reset (otherwise the same error text appears
                  // to "stick" across submit attempts even after the user
                  // fixes one field).
                  setError("");
                  if (!form.producer_name) {
                    setError(t("auth.register.producer.validation.producer_name_required"));
                    return;
                  }
                  if (!form.phone || !validateIsraeliPhone(form.phone)) {
                    setError(t("auth.register.producer.validation.phone_required"));
                    return;
                  }
                  if (form.category_ids.length === 0) {
                    setError(t("auth.register.producer.validation.category_required"));
                    return;
                  }
                  if (!agreedToTerms) {
                    setError(t("auth.register.producer.validation.terms_required"));
                    return;
                  }
                  if (!declarationConfirmed) {
                    setError(t("auth.register.producer.validation.declaration_required"));
                    return;
                  }
                  if (farmerDeclarationRequired && !farmerConfirmed) {
                    setError(t("auth.register.producer.validation.farmer_required"));
                    return;
                  }
                  handleSubmit();
                }}
                disabled={loading}
                className="flex-1 border-2 border-primary-dark text-primary-dark bg-transparent py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <ButtonSpinner />
                    {t("auth.register.producer.actions.submitting")}
                  </span>
                ) : (
                  t("auth.register.producer.actions.submit")
                )}
              </button>
            </div>
          </div>
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
          <div className="text-center py-8">
            <div className="mb-4 flex justify-center">
              <CheckCircle size={64} weight="fill" className="text-primary" aria-hidden="true" />
            </div>
            <h2 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.producer.success.heading")}</h2>
            <p className="text-fg-muted mb-6">
              {whatsappSent
                ? t("auth.register.producer.success.body_with_whatsapp")
                : t("auth.register.producer.success.body_no_whatsapp")}
            </p>
            {!whatsappSent && (
              <div
                role="status"
                className="bg-background border border-border text-fg-muted rounded-md px-4 py-3 mb-6 text-sm text-end"
              >
                {t("auth.register.producer.success.whatsapp_warning")}
              </div>
            )}
            <div className="bg-green-50 rounded-lg p-5 text-start mb-6">
              <h3 className="font-semibold text-text mb-3">{t("auth.register.producer.success.next_heading")}</h3>
              <ul className="text-sm text-fg-muted space-y-2">
                <li>{t("auth.register.producer.success.next_step1")}</li>
                <li>{t("auth.register.producer.success.next_step2")}</li>
                <li>{t("auth.register.producer.success.next_step3")}</li>
              </ul>
              {/* MEH-914: photo-to-publish disclosure — mirrors the story step. */}
              <p data-testid="photo-disclosure-success" className="text-sm text-fg-muted text-start leading-relaxed mt-3">{t("auth.register.producer.photo_disclosure")}</p>
            </div>
            {/* MEH-132: S7 06A founder sign-off */}
            <p className="font-headline-md text-text text-center mb-2">{t("auth.register.producer.success.signature")}</p>
            <p className="text-xs text-fg-muted mb-6 text-center leading-relaxed">{t("auth.register.producer.success.tier_trust")}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push("/producer/dashboard")}
                className="border-2 border-primary-dark text-primary-dark bg-transparent px-6 py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium text-sm"
              >
                {t("auth.register.producer.success.dashboard_cta")}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(t("auth.register.producer.success.share_msg"))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp-outline inline-flex items-center gap-2 px-6 py-3 rounded-md font-medium text-sm"
              >
                <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
                {t("auth.register.producer.success.share_cta")}
              </a>
            </div>
          </div>
        )}
        {step === STEP.CONFIRM && !didUpgrade && (
          <div className="text-center py-8" data-testid="register-frame-confirm">
            <div className="w-16 h-16 rounded-full bg-background mx-auto mb-4 flex items-center justify-center" aria-hidden="true">
              <EnvelopeSimple size={32} className="text-fg-muted" aria-hidden="true" />
            </div>
            <h2 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.producer.success.inbox_title")}</h2>
            <p className="text-fg-muted text-sm mb-3">{t("auth.register.producer.success.inbox_body")}</p>
            <p className="text-fg-muted text-xs mb-6">{t("auth.register.producer.success.inbox_hint")}</p>
            <p className="text-xs text-fg-muted mb-6 text-center leading-relaxed">{t("auth.register.producer.success.tier_trust")}</p>
            <button
              onClick={() => router.push("/")}
              className="border-2 border-primary-dark text-primary-dark bg-transparent px-6 py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium text-sm"
            >
              {t("auth.register.producer.success.back_home")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
