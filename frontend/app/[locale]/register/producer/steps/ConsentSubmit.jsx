// @ts-check
/**
 * ConsentSubmit — the consent checkboxes, the collection notice and the
 * «הצטרפו» button that end the business registration wizard.
 * MEH-3656: moved verbatim out of StoryStep.jsx so the LAST visible step can
 * submit. A business now submits from CategoryStep (the story step is gone
 * from its path, MEH-3653); an organizer still submits from StoryStep.
 * Holds no hooks: every value arrives as a prop from RegisterProducerClient.jsx.
 */
import { Link } from "@/i18n/navigation";
import ButtonSpinner from "@/components/ButtonSpinner";
import { CONTACT_EMAIL } from "@/lib/env.client";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { CROSS_STEP_REQUIRED } from "../registerProducerShared";
import Checkbox from "@/components/ui/Checkbox";

/**
 * @param {Record<string, any>} props
 * `beforeSubmit` runs first and returns false to stop (the step's own gate,
 * e.g. the category + license checks); `onBack` is the step's back action.
 */
export default function ConsentSubmit({ agreedToTerms, backTestId, beforeSubmit, declarationConfirmed, error, farmerConfirmed, farmerDeclarationRequired, handleSubmit, loading, onBack, runRequiredGate, setAgreedToTerms, setDeclarationConfirmed, setError, setFarmerConfirmed, setStep, submitTestId, t }) {
  const submit = () => {
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
    if (beforeSubmit && !beforeSubmit()) return;
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
  };

  return (
    <>
      {/* MEH-759 Chunk C: three separate affirmative acts — ToS/privacy
          consent (chrome, plural), the binding licensing declaration
          (first-person), and the conditional grower declaration. ADR-014
          voice separation; each locked string is its own verbatim key. */}
      <Checkbox
        className="flex items-start gap-2 text-sm"
        boxClassName="mt-0.5"
        checked={agreedToTerms}
        onChange={(e) => setAgreedToTerms(e.target.checked)}
        required
      >
        <span className="leading-relaxed text-fg-muted">
          {t("auth.register.producer.terms.intro")}{" "}
          <Link href="/terms" target="_blank" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{t("auth.register.producer.terms.tos_link")}</Link>{" "}
          {t("auth.register.producer.terms.and")}<Link href="/privacy" target="_blank" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{t("auth.register.producer.terms.privacy_link")}</Link>
        </span>
      </Checkbox>

      <Checkbox
        className="flex items-start gap-2 text-sm"
        boxClassName="mt-0.5"
        checked={declarationConfirmed}
        onChange={(e) => setDeclarationConfirmed(e.target.checked)}
        required
      >
        <span className="leading-relaxed text-fg-muted">
          {t("auth.register.producer.terms.declaration")}
        </span>
      </Checkbox>

      {farmerDeclarationRequired && (
        <Checkbox
          className="flex items-start gap-2 text-sm"
          boxClassName="mt-0.5"
          checked={farmerConfirmed}
          onChange={(e) => setFarmerConfirmed(e.target.checked)}
          required
        >
          <span className="leading-relaxed text-fg-muted">
            {t("auth.register.producer.terms.farmer_declaration")}
          </span>
        </Checkbox>
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
              // whitespace-nowrap, not break-all: break-all split the address after its
              // first letter at 390 (Sapir 22/11). It fits one line on a phone.
              className="text-primary underline whitespace-nowrap"
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
        <button data-testid={backTestId} onClick={onBack} className="text-muted">{t("auth.register.producer.actions.back")}</button>
        <Button
          data-testid={submitTestId}
          onClick={submit}
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
    </>
  );
}
