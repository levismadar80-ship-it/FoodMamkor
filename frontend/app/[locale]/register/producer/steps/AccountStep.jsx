// @ts-check
/**
 * AccountStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import PasswordStrength from "@/components/PasswordStrength";
import ProducerOAuthButtons from "@/components/ProducerOAuthButtons";
import Input from "@/components/ui/Input";
import { passwordValid, validateEmail } from "@/lib/validators";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import EmailTypoHint from "@/components/EmailTypoHint";
import { STEP } from "../registerProducerShared";

/** @param {Record<string, any>} props */
export default function AccountStep({ form, numberedTitle, refreshUser, requestFocus, routePath, router, set, setStep, setStepError, stepError, t }) {
  return (
    <div className="space-y-4" data-testid="register-frame-account">
      <h2 className="font-headline-md text-lg font-black">{numberedTitle(t("auth.register.producer.steps.account.title"), STEP.ACCOUNT)}</h2>
      {/* MEH-2183: step-top expectation line — names the time cost and
          that the draft survives leaving (setAndSave already persists it). */}
      <p data-testid="register-account-duration-hint" className="text-xs text-fg-muted text-start">
        {t("auth.register.producer.steps.account.duration_hint")}
      </p>

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
            router.push(`/login?redirect=${encodeURIComponent(routePath)}`);
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
          (F3): min-h-touch enforces the WCAG 2.5.5 touch-target floor,
          matching CitySearch.jsx:118. */}
      <Input
        id="producer-account-name"
        label={t("auth.register.producer.fields.name_label")}
        data-testid="register-account-name"
        placeholder={t("auth.register.producer.fields.name")}
        value={form.name}
        onChange={set("name")}
        required
        dir="rtl"
        // MEH-2481: without these, Chrome's autofill put the saved
        // EMAIL into the name field and the saved PASSWORD into the
        // new-password field (measured on staging, 28/10). The
        // attributes tell the browser which slot is which.
        autoComplete="name"
      />
      <Input
        id="producer-account-email"
        type="email"
        label={t("auth.register.producer.fields.email_label")}
        data-testid="register-account-email"
        placeholder={t("auth.register.producer.fields.email")}
        value={form.email}
        onChange={set("email")}
        required
        dir="ltr"
        autoComplete="email"
      />
      <EmailTypoHint fieldId="producer-account-email" value={form.email} onAccept={(email) => set("email")({ target: { value: email } })} />
      {/* MEH-328 Chunk C: emailExistsWarning render block removed
          with handleEmailBlur. emailExistsSubmitError block below
          (rendered on 409 from submit) is preserved by Chunk D. */}
      <div>
        <label htmlFor="producer-account-password" className="block text-sm font-medium text-text mb-1 text-start">
          {t("auth.register.producer.fields.password_label")}{" "}
          <span className="text-error" aria-hidden="true">
            *
          </span>
        </label>
        <Input
          id="producer-account-password"
          type="password"
          data-testid="register-account-password"
          placeholder={t("auth.register.producer.fields.password")}
          value={form.password}
          onChange={set("password")}
          required
          dir="ltr"
          minLength={12}
          autoComplete="new-password"
        />
        <PasswordStrength password={form.password} />
      </div>
      {stepError && <InlineMessage>{stepError}</InlineMessage>}
      <Button
        data-testid="register-account-next"
        onClick={() => {
          // MEH-1807: ACCOUNT already validated its OWN fields on its own
          // step, so the cross-step defect never existed here — the only
          // thing missing was focus. The form-level message + role="alert"
          // are deliberately left alone (pinned by MEH-886); moving them
          // into three inline slots would be a rewrite of a step that
          // works, and would drop an assertion that exists on purpose.
          if (!form.name || !form.email || !form.password) {
            setStepError(t("auth.register.producer.validation.all_required"));
            requestFocus(
              !form.name
                ? "producer-account-name"
                : !form.email
                  ? "producer-account-email"
                  : "producer-account-password",
            );
            return;
          }
          if (!validateEmail(form.email)) {
            setStepError(t("auth.register.producer.validation.email_invalid"));
            requestFocus("producer-account-email");
            return;
          }
          if (!passwordValid(form.password)) {
            setStepError(t("auth.register.producer.validation.password_complexity"));
            requestFocus("producer-account-password");
            return;
          }
          setStepError("");
          setStep(STEP.DETAILS);
        }}
        variant="primary" size="lg" className="w-full"
      >
        {t("auth.register.producer.actions.next")}
      </Button>
    </div>
  );
}
