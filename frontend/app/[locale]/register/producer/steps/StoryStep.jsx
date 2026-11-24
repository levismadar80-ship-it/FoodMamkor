// @ts-check
/**
 * StoryStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import Input from "@/components/ui/Input";
import ConsentSubmit from "./ConsentSubmit";
import ReferralSourceField from "./ReferralSourceField";
import { DESCRIPTION_PENDING_KEY, STEP } from "../registerProducerShared";

/** @param {Record<string, any>} props */
export default function StoryStep({ agreedToTerms, declarationConfirmed, descriptionBeforeDisableRef, descriptionDisabled, descriptionPlaceholder, error, farmerConfirmed, farmerDeclarationRequired, form, handleSubmit, isOrganizer, loading, numberedTitle, runRequiredGate, set, setAgreedToTerms, setAndSave, setDeclarationConfirmed, setDescriptionDisabled, setError, setFarmerConfirmed, setStep, setStepError, t }) {
  return (
    <div className="space-y-4" data-testid="register-frame-story">
      <h2 className="font-headline-md text-lg font-black">{numberedTitle(t("auth.register.producer.steps.story.title"), STEP.STORY)}</h2>
      {/* MEH-2185: the step-top expectation line (photo_next_hint, added by
          MEH-2183) is GONE, and deliberately not replaced. It overlapped in
          substance with photo_disclosure further down this same step, which
          stays byte-unchanged: that one is the gate ("without a photo the
          page does not go live") and carries the image-licence side too
          (MEH-1184), so it is the one that had to survive. The copy ruling
          the old note asked for is on MEH-2185. */}
      {/* MEH-860: frame-03 tagline (short_description) — the one-line
          "dek" above the long story. Plain text input (event-based
          set(), like address); the long description below is byte-identical. */}
      <div>
        <Input
          id="producer-tagline"
          label={t("auth.register.producer.fields.tagline_label")}
          data-testid="register-story-tagline"
          value={form.short_description}
          onChange={set("short_description")}
          maxLength={160}
          placeholder={t("auth.register.producer.fields.tagline_placeholder")}
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
          data-testid="register-story-description"
          value={form.description}
          onChange={set("description")}
          disabled={descriptionDisabled}
          placeholder={descriptionPlaceholder}
          rows={6}
          className="w-full border rounded-sm ps-3 pe-3 py-2 text-start min-h-[9rem] md:min-h-[12rem] disabled:bg-green-50 disabled:text-fg-muted disabled:cursor-not-allowed focus-ring"
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

      <ReferralSourceField form={form} set={set} setAndSave={setAndSave} t={t} />

      <ConsentSubmit
        agreedToTerms={agreedToTerms}
        backTestId="register-story-back"
        declarationConfirmed={declarationConfirmed}
        error={error}
        farmerConfirmed={farmerConfirmed}
        farmerDeclarationRequired={farmerDeclarationRequired}
        handleSubmit={handleSubmit}
        loading={loading}
        onBack={() => { setStepError(""); setError(""); setStep(isOrganizer ? STEP.DETAILS : STEP.CATEGORY); }}
        runRequiredGate={runRequiredGate}
        setAgreedToTerms={setAgreedToTerms}
        setDeclarationConfirmed={setDeclarationConfirmed}
        setError={setError}
        setFarmerConfirmed={setFarmerConfirmed}
        setStep={setStep}
        submitTestId="register-story-submit"
        t={t}
      />
    </div>
  );
}
