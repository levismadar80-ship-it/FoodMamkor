// @ts-check
/**
 * StoryStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import { Link } from "@/i18n/navigation";
import ButtonSpinner from "@/components/ButtonSpinner";
import RegisterCardPreview from "@/components/RegisterCardPreview";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CONTACT_EMAIL } from "@/lib/env.client";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { CROSS_STEP_REQUIRED, DESCRIPTION_PENDING_KEY, REFERRAL_SOURCE_KEYS, STEP, fulfilmentBooleans } from "../registerProducerShared";

/** @param {Record<string, any>} props */
export default function StoryStep({ agreedToTerms, categories, declarationConfirmed, descriptionBeforeDisableRef, descriptionDisabled, descriptionPlaceholder, error, farmerConfirmed, farmerDeclarationRequired, form, handleSubmit, isOrganizer, loading, runRequiredGate, set, setAgreedToTerms, setAndSave, setDeclarationConfirmed, setDescriptionDisabled, setError, setFarmerConfirmed, setStep, setStepError, t }) {
  return (
    <div className="space-y-4" data-testid="register-frame-story">
      <h2 className="font-headline-md text-lg font-black">{t("auth.register.producer.steps.story.title")}</h2>
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

      {/* MEH-3074: the real card, opened on demand so the submit button
          stays where it was on a phone. Organizers have no card — they
          are not in the business list. */}
      {!isOrganizer && (
        <RegisterCardPreview
          form={{ ...form, ...fulfilmentBooleans(form.fulfilment) }}
          categories={categories}
        />
      )}

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

      {/* MEH-1471: self-reported attribution — dropdown directly above
          the ToS consent (final step). Default "בחרו אפשרות" with no
          preselection (Ruler Analytics speed-bias → first-option overcount).
          Selecting "other" reveals an optional free-text input. English
          keys stored; Hebrew from i18n.
          MEH-2183: OPTIONAL — leaving it empty no longer blocks submit. */}
      <div data-testid="register-referral-source-block">
        <label
          htmlFor="register-referral-source"
          className="block text-sm font-medium text-text mb-1 text-start"
        >
          {t("auth.register.producer.fields.referral_source.label")}
        </label>
        {/* MEH-2183: the field is optional now that the submit gate is
            gone. Class recipe mirrors the address_optional_hint paragraph
            (:1203) — the repo's established optional-field hint. */}
        <p
          data-testid="register-referral-optional-hint"
          className="text-xs text-fg-muted mb-1 text-start"
        >
          {t("auth.register.producer.fields.referral_source.optional_hint")}
        </p>
        <Select
          size="md"
          id="register-referral-source"
          data-testid="register-referral-source"
          value={form.referral_source}
          onChange={(e) => {
            const value = e.target.value;
            setAndSave((prev) => ({
              ...prev,
              referral_source: value,
              // Clear the free-text answer once the choice is not "other".
              referral_source_other:
                value === "other" ? prev.referral_source_other : "",
            }));
          }}
          className="text-start"
        >
          <option value="" disabled>
            {t("auth.register.producer.fields.referral_source.placeholder")}
          </option>
          {REFERRAL_SOURCE_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(
                `auth.register.producer.fields.referral_source.options.${key}`,
              )}
            </option>
          ))}
        </Select>
        {form.referral_source === "other" && (
          <Input
            id="register-referral-source-other"
            data-testid="register-referral-source-other"
            type="text"
            maxLength={120}
            value={form.referral_source_other}
            onChange={set("referral_source_other")}
            placeholder={t(
              "auth.register.producer.fields.referral_source.other_placeholder",
            )}
            // MEH-1471 a11y (IS-5568): the placeholder is the only visible
            // text and disappears on input, so name the field explicitly for
            // screen readers (the select above uses a visible <label>).
            aria-label={t(
              "auth.register.producer.fields.referral_source.other_placeholder",
            )}
            className="mt-2 text-start"
          />
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
          <Link href="/terms" target="_blank" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{t("auth.register.producer.terms.tos_link")}</Link>{" "}
          {t("auth.register.producer.terms.and")}<Link href="/privacy" target="_blank" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{t("auth.register.producer.terms.privacy_link")}</Link>
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
      {error && <InlineMessage>{error}</InlineMessage>}

      {/* MEH-2200 (Amendment 13, s.11 disclosure duty): the collection
          notice must be given AT collection, so it renders inline on the
          frame that submits — not behind a disclosure the seller can skip.
          Recipients are stated as "the service providers that run the
          site" with the full list one tap away in /privacy: Phase 0 found
          registration details also reach Anthropic (risk screening) and
          Meta (the WhatsApp reply promised one line below), so the
          narrower "infrastructure providers" wording would have
          under-stated them. CONTACT_EMAIL is the same constant the
          privacy page gives for rights requests, so the two surfaces
          cannot drift. */}
      <p
        data-testid="register-collection-notice"
        className="text-xs text-fg-muted text-start leading-relaxed"
      >
        {t.rich("auth.register.producer.collection_notice", {
          privacy: (chunks) => (
            <Link
              href="/privacy"
              target="_blank"
              className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current"
            >
              {chunks}
            </Link>
          ),
          // The placeholder text inside <email>…</email> in the message
          // files is deliberately discarded — the rendered address is
          // CONTACT_EMAIL, so the two surfaces cannot name different
          // mailboxes. Named `_chunks` rather than omitted so a
          // translator editing that placeholder can see it is inert.
          email: (_chunks) => (
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline break-all"
              dir="ltr"
            >
              {CONTACT_EMAIL}
            </a>
          ),
        })}
      </p>

      {/* MEH-2183: what-happens-next, immediately above the submit button.
          Phase 0 verified this was ABSENT from the STORY step — the only
          comparable copy lives on the post-submit CONFIRM frame
          (success.*, :1930+), which the seller cannot see while deciding
          to press this button. */}
      <p data-testid="register-submit-next-hint" className="text-xs text-fg-muted text-start">
        {t("auth.register.producer.submit_next_hint")}
      </p>

      <div className="flex gap-3">
        <button data-testid="register-story-back" onClick={() => { setStepError(""); setError(""); setStep(isOrganizer ? STEP.DETAILS : STEP.CATEGORY); }} className="text-muted">{t("auth.register.producer.actions.back")}</button>
        <Button
          data-testid="register-story-submit"
          onClick={() => {
            // Clear stale error first so the next failure renders a
            // visible reset (otherwise the same error text appears
            // to "stick" across submit attempts even after the user
            // fixes one field).
            setError("");
            // MEH-1807: all CROSS_STEP_REQUIRED fields (four as of MEH-2015
            // chunk B) are still checked here — a restored draft can blank
            // one while the seller is already on STORY, so the per-step
            // gates are not a complete guarantee. What changed is the
            // OUTCOME: instead of painting "יש למלא שם עסק" next to a
            // button two frames away from the field, send the seller to
            // the step that owns the first offender, focused on it, with
            // the message inline.
            const offenders = runRequiredGate(CROSS_STEP_REQUIRED, {
              isSubmit: true,
            });
            if (offenders.length > 0) {
              setStep(offenders[0].step);
              return;
            }
            // MEH-2183: the MEH-1471 attribution gate is REMOVED. The
            // field stays and still rides the payload — it is simply no
            // longer a submit blocker, so an empty value reaches the
            // backend as NULL (the MEH-1471 upgrade path already accepts
            // that). Registration must not be blocked by an analytics
            // question.
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
          variant="primary" size="lg" className="flex-1"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <ButtonSpinner />
              {t("auth.register.producer.actions.submitting")}
            </span>
          ) : (
            t("auth.register.producer.actions.submit")
          )}
        </Button>
      </div>
    </div>
  );
}
