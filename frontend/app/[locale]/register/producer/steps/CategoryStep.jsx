// @ts-check
/**
 * CategoryStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import CategorySelector from "@/components/CategorySelector";
import Button from "@/components/ui/Button";
import ConsentSubmit from "./ConsentSubmit";
import ReferralSourceField from "./ReferralSourceField";
import InlineMessage from "@/components/ui/InlineMessage";
import { CROSS_STEP_REQUIRED, STEP } from "../registerProducerShared";

/** @param {Record<string, any>} props */
export default function CategoryStep({ agreedToTerms, declarationConfirmed, error, farmerConfirmed, farmerDeclarationRequired, handleSubmit, loading, setAgreedToTerms, setDeclarationConfirmed, setFarmerConfirmed, categories, categoriesFailed, fieldErrors, form, loadCategories, numberedTitle, runRequiredGate, set, setAndSave, setError, setShowCategoryModal, setStep, setStepError, t, toggleCategory }) {
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

      {/* MEH-3697: «מאיפה שמעתם עלינו?» came back to the business path
          here. It lived on the story step, which MEH-3656 took off this path,
          and no dashboard screen ever asked it (Sapir 22/11). Optional, as
          before (MEH-2183). */}
      <ReferralSourceField form={form} set={set} setAndSave={setAndSave} t={t} />

      {/* MEH-3656: the business path ends HERE. The story step left the
          business wizard (MEH-3653: the story and tagline are filled in the
          dashboard), so this step carries the consent block and the
          «הצטרפו» button. Its own gate (category, then license) runs
          first, unchanged from the old «הבא» handler. */}
      <ConsentSubmit
        agreedToTerms={agreedToTerms}
        backTestId="register-category-back"
        beforeSubmit={() => {
          const offenders = runRequiredGate(
            CROSS_STEP_REQUIRED.filter((c) => c.step === STEP.CATEGORY),
          );
          return offenders.length === 0;
        }}
        declarationConfirmed={declarationConfirmed}
        error={error}
        farmerConfirmed={farmerConfirmed}
        farmerDeclarationRequired={farmerDeclarationRequired}
        handleSubmit={handleSubmit}
        loading={loading}
        onBack={() => { setStepError(""); setError(""); setStep(STEP.DETAILS); }}
        runRequiredGate={runRequiredGate}
        setAgreedToTerms={setAgreedToTerms}
        setDeclarationConfirmed={setDeclarationConfirmed}
        setError={setError}
        setFarmerConfirmed={setFarmerConfirmed}
        setStep={setStep}
        submitTestId="register-category-submit"
        t={t}
      />
    </div>
  );
}
