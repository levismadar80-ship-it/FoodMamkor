// @ts-check
/**
 * CategoryStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import { X } from "@phosphor-icons/react";
import CategorySelector from "@/components/CategorySelector";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { CROSS_STEP_REQUIRED, STEP } from "../registerProducerShared";
import { formatHebrewQuotedList } from "@/lib/license-required-categories";

/** @param {Record<string, any>} props */
export default function CategoryStep({ categories, categoriesFailed, fieldErrors, form, licenseCategoryNames = [], licenseOptionalExpanded, licensePending, licenseRequired, licenseRequiredError, licenseWarning, loadCategories, numberedTitle, requestFocus, runRequiredGate, set, setAndSave, setError, setLicenseOptionalExpanded, setLicensePending, setLicenseRequiredError, setShowCategoryModal, setStep, setStepError, t, toggleCategory }) {
  return (
    <div className="space-y-4" data-testid="register-frame-category">
      <h2 id="register-category-heading" className="font-headline-md text-lg font-black">{numberedTitle(t("auth.register.producer.steps.category.title"), STEP.CATEGORY)}</h2>
      {/* MEH-1807: the selector is a card grid, not a form control, so it
          has no id to focus and nothing to hang aria-describedby on. A
          labelled group wrapper gives the required-gate both — tabIndex
          -1 keeps it out of the tab order while staying focusable
          programmatically. */}
      <div
        id="register-category-selector"
        tabIndex={-1}
        role="group"
        aria-labelledby="register-category-heading"
        aria-describedby={fieldErrors.category_ids ? "register-category-error" : undefined}
        className="focus-ring rounded-md"
      >
        {categoriesFailed && (
          <div data-testid="register-categories-failed" className="flex items-center gap-3 mb-3">
            <InlineMessage size="xs" className="text-start">{t("dashboard.producer.categories.fetch_error")}</InlineMessage>
            <Button type="button" variant="secondary" size="sm" onClick={loadCategories}>
              {t("errors.boundary.retry")}
            </Button>
          </div>
        )}
        <CategorySelector
          categories={categories}
          selectedIds={form.category_ids}
          onChange={toggleCategory}
          onRequestCategory={() => setShowCategoryModal(true)}
        />
      </div>
      {fieldErrors.category_ids && (
        <p
          id="register-category-error"
          data-testid="register-category-error"
          className="text-xs text-error mt-1 text-start"
        >
          {fieldErrors.category_ids}
        </p>
      )}

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
          {/* MEH-2928: names the category (or categories) that caused the
              requirement, instead of «בקטגוריה זו». ICU plural in he.json. */}
          <p className="text-xs text-fg-muted mb-2 text-start" data-testid="register-license-required-hint">
            {t("auth.register.producer.fields.license_required_hint", {
              count: licenseCategoryNames.length,
              names: formatHebrewQuotedList(licenseCategoryNames),
            })}
          </p>
          {/* MEH-951: "what is this" extension after the required hint. */}
          <p className="text-xs text-fg-muted mb-2 text-start">
            {t("auth.register.producer.fields.license_what_is_it")}
          </p>
          <Input
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
            className="text-right"
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
          {!licensePending && licenseRequiredError && (
            <InlineMessage size="xs" className="mt-1 text-start">
              {t("auth.register.producer.validation.license_required")}
            </InlineMessage>
          )}
          {/* MEH-971 chunk 1: opt-in to submit without a license number.
              Checking it relaxes the advance gate + sends license_pending. */}
          <label className="flex items-start gap-2 text-sm cursor-pointer mt-3">
            <input
              type="checkbox"
              data-testid="register-license-pending-optin"
              checked={licensePending}
              onChange={(e) => {
                setLicensePending(e.target.checked);
                if (e.target.checked) setLicenseRequiredError(false);
              }}
              className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
            />
            <span className="leading-relaxed text-fg-muted">
              {t("auth.register.producer.fields.license_pending_optin_label")}
            </span>
          </label>
          {/* MEH-2927 (pilot B3d): rendered unconditionally and hidden
              with `visibility`, not mounted on the tick. Measured at
              390x664: mounting it moved «הבא» down 36px in document
              space at the exact moment of the tap, which is a
              tap-target hazard right where the thumb already is.
              `invisible` reserves the element's REAL height — including
              however many lines it wraps to at this width, which a
              fixed min-height would have to guess — and keeps it out of
              the accessibility tree, which `opacity-0` would not. */}
          <p
            className={`text-xs text-fg-muted mt-1 text-start${licensePending ? "" : " invisible"}`}
            data-testid="register-license-pending-hint"
          >
            {t("auth.register.producer.fields.license_pending_optin_hint")}
          </p>
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
          <Input
            id="producer-license-optional"
            value={form.producer_license_number}
            onChange={set("producer_license_number")}
            maxLength={20}
            inputMode="numeric"
            // text-right kept: dir="ltr" numeric license — physical right = start side in the RTL form; logical text-start would follow the field's own ltr direction instead
            className="text-right"
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
        <Button
          data-testid="register-category-next"
          onClick={() => {
            // MEH-1807: "at least one category" is validated on the step
            // that owns the selector. Runs BEFORE the license gate because
            // licenseRequired is derived from the selection — with nothing
            // selected there is no license question to ask yet.
            const offenders = runRequiredGate(
              CROSS_STEP_REQUIRED.filter((c) => c.step === STEP.CATEGORY),
            );
            if (offenders.length > 0) return;
            // MEH-952: block advance when a license-required category is
            // selected but the number is blank; show the error at the field.
            // MEH-971 chunk 1: the license-pending opt-in bypasses this gate.
            if (
              licenseRequired &&
              !licensePending &&
              !form.producer_license_number.trim()
            ) {
              setLicenseRequiredError(true);
              requestFocus("producer-license-required");
              return;
            }
            setLicenseRequiredError(false);
            setStep(STEP.STORY);
          }}
          variant="primary" size="lg" className="flex-1"
        >
          {t("auth.register.producer.actions.next")}
        </Button>
      </div>
    </div>
  );
}
