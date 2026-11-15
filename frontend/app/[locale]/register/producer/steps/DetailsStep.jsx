// guard-ok: moved verbatim out of RegisterProducerClient.jsx (MEH-3294), which was never type-checked; its aria-invalid string on CitySearch (typed boolean) is kept as is to keep the move byte-for-byte.
/**
 * DetailsStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import { Link } from "@/i18n/navigation";
import { X } from "@phosphor-icons/react";
import CitySearch from "@/components/CitySearch";
import Input from "@/components/ui/Input";
import RegisterNameCheck from "@/components/RegisterNameCheck";
import { validateIsraeliPhone } from "@/lib/validators";
import { PRICING_PATH } from "@/lib/pricing";
import Button from "@/components/ui/Button";
import { CROSS_STEP_REQUIRED, FULFILMENT_OPTIONS, STEP } from "../registerProducerShared";

/** @param {Record<string, any>} props */
export default function DetailsStep({ clearFieldError, fieldErrors, form, fulfilment, fulfilmentError, handleCityKnownChange, isOrganizer, isUpgrade, phoneErrorMessage, runRequiredGate, set, setAndSave, setError, setFulfilmentError, setStep, setStepError, t }) {
  return (
    <div className="space-y-4" data-testid="register-frame-details">
            <h2 className="font-headline-md text-lg font-black">{t("auth.register.producer.steps.business.title")}</h2>
            <p className="text-sm text-fg-muted">
              {t("auth.register.producer.steps.business.subtitle")}
            </p>
            {/* MEH-2183: the no-cost promise, stated on the step where the
                seller starts investing real effort. */}
            <p data-testid="register-details-free-hint" className="text-xs text-fg-muted text-start">
              {t("auth.register.producer.steps.business.free_hint")}{" "}
              {/* MEH-3166: new tab, so a half-filled form is not lost. */}
              <Link
                href={PRICING_PATH}
                target="_blank"
                rel="noopener"
                data-testid="register-pricing-link"
                className="underline underline-offset-2 text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t("pricing.link_short")}
              </Link>
            </p>

            <Input
              id="producer-business-name"
              label={t("auth.register.producer.fields.producer_name_label")}
              data-testid="register-details-name"
              placeholder={t("auth.register.producer.fields.producer_name")}
              value={form.producer_name}
              onChange={set("producer_name")}
              // MEH-1807: the primitive owns aria-invalid + aria-describedby +
              // the error text (MEH-602/MEH-1128) — this is the wiring the
              // pre-1807 code had available and never used.
              error={fieldErrors.producer_name}
              required
              dir="rtl"
            />
            <RegisterNameCheck name={form.producer_name} />

            <div>
              <label htmlFor="producer-phone" className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.phone_label")}{" "}
                <span className="text-error" aria-hidden="true">
                  *
                </span>
              </label>
              <Input
                id="producer-phone"
                data-testid="register-details-phone"
                type="tel"
                autoComplete="tel"
                placeholder={t("auth.register.producer.fields.phone")}
                value={form.phone}
                onChange={set("phone")}
                required
                invalid={!!phoneErrorMessage}
                aria-describedby={phoneErrorMessage ? "register-phone-error" : undefined}
                dir="ltr"
              />
              {phoneErrorMessage && (
                <p id="register-phone-error" className="text-xs text-error mt-1 inline-flex items-center gap-1"><X size={14} className="text-current" />{phoneErrorMessage}</p>
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
            {/* MEH-2015 chunk B: `required` now gates — MEH-951's visual-only
                exception is revoked (Sapir's 14.8.2026 ruling). CROSS_STEP_REQUIRED
                blocks the DETAILS→CATEGORY advance and the final submit on an
                empty city. CitySearch is passthrough-only for aria-invalid/
                aria-describedby (MEH-2022) — the caller renders the message,
                same pattern as the phone field above. */}
            <CitySearch
              id="producer-city"
              labelVisible
              required
              label={t("auth.register.producer.fields.city_label")}
              placeholder={t("auth.register.producer.fields.city")}
              value={form.city}
              onChange={(v, meta) => {
                clearFieldError("city");
                // MEH-2241 chunk B: the second argument is CitySearch's verdict
                // at emit time (chunk A contract); a one-argument emit reads
                // as unknown, which is the safe side of the MEH-213 rule.
                setAndSave((prev) => ({ ...prev, city: v, city_known: Boolean(meta?.known) }));
              }}
              onKnownChange={handleCityKnownChange}
              aria-invalid={fieldErrors.city ? "true" : undefined}
              aria-describedby={fieldErrors.city ? "register-city-error" : undefined}
            />
            {fieldErrors.city && (
              <p id="register-city-error" className="text-xs text-error mt-1 inline-flex items-center gap-1"><X size={14} className="text-current" />{fieldErrors.city}</p>
            )}
            </div>
{/* MEH-2640: step 2 is three fields and one question. What left, and
                where it went:
                  · address + the pin-drag/confirm/mismatch block — the dashboard
                  · "יותר מנקודת מכירה אחת"                        — the dashboard
                  · the organizer checkbox        — RegisterPreflight (Sapir, 03/11)
                  · the delivery-cities picker    — the dashboard, with the note below
                The payload simply stops carrying them, which the schema already
                allows: ProducerRegister gives has_physical_location /
                offers_delivery / delivery_nationwide / delivery_cities defaults
                (schemas.py:957-960) and address / lat / lng are optional
                (:838-840). `city` stays required there (:837) and stays a
                required field here.
                This also removes the LAST seven `admin.*` strings the register
                flow rendered — they were all inside the delivery block. */}
            {/* MEH-2640: not for an organizer. "איך קונים אצלכם?" is a
                business question — she runs markets, she has no counter and
                no deliveries — and MEH-2460 already hid the delivery axis this
                replaces for the same reason. The gate below skips with her. */}
            {!isOrganizer && (
            <fieldset className="pt-1 space-y-3" data-testid="register-fulfilment">
              <legend className="block text-sm font-medium text-text mb-1 text-start">
                {t("auth.register.producer.fields.fulfilment.legend")}
                <span aria-hidden="true"> *</span>
              </legend>
              {FULFILMENT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`fulfilment-${opt.value}`}
                  className="flex items-center gap-3 min-h-touch cursor-pointer"
                >
                  <input
                    type="radio"
                    id={`fulfilment-${opt.value}`}
                    name="fulfilment"
                    value={opt.value}
                    data-testid={`register-fulfilment-${opt.value}`}
                    checked={fulfilment === opt.value}
                    onChange={() => {
                      setStepError("");
                      setFulfilmentError("");
                      setAndSave((prev) => ({ ...prev, fulfilment: opt.value }));
                    }}
                    className="w-5 h-5 accent-primary shrink-0"
                  />
                  <span className="text-sm text-text">
                    {t(`auth.register.producer.fields.fulfilment.${opt.value}`)}
                  </span>
                </label>
              ))}
              {fulfilmentError && (
                <p className="text-xs text-error" data-testid="register-fulfilment-error">
                  {fulfilmentError}
                </p>
              )}
              {/* MEH-2640: the delivery-areas picker moved to the dashboard
                  she lands in anyway. ProducerDashboardDelivery's editor
                  already owns that list — see the dashboard delivery editor
                  cited in the PR — so this is a pointer, not a promise of
                  something unbuilt. */}
              <p className="text-xs text-fg-muted text-start" data-testid="register-delivery-note">
                {t("auth.register.producer.fields.fulfilment.areas_note")}
              </p>
            </fieldset>
            )}

            <div className="flex gap-3">
              {!isUpgrade && (
                <button data-testid="register-details-back" onClick={() => { setStepError(""); setError(""); setStep(STEP.ACCOUNT); }} className="text-muted">{t("auth.register.producer.actions.back")}</button>
              )}
              <Button
                data-testid="register-details-next"
                onClick={() => {
                  // MEH-1807: producer_name + phone + city (MEH-2015 chunk B) are
                  // validated HERE now, on the step that owns them, instead of two
                  // frames later next to the submit button. runRequiredGate focuses
                  // the first offender; a blocked advance is the whole point.
                  const offenders = runRequiredGate(
                    CROSS_STEP_REQUIRED.filter((c) => c.step === STEP.DETAILS),
                  );
                  if (offenders.length > 0) return;
                  // MEH-1838 chunk B: mirror the server validator client-side
                  // (schemas.py:857+ _validate_location_mode) rather than relying
                  // on it. A 422 two frames later names a field the seller can no
                  // longer see; blocking the advance is the whole point, same as
                  // the runRequiredGate above.
                  // MEH-2460: an organizer has no delivery axis and no
                  // category step — straight on to STORY.
                  if (isOrganizer) {
                    setStepError("");
                    setStep(STEP.STORY);
                    return;
                  }
                  // MEH-2640: one question, one gate, and the copy is ours
                  // rather than borrowed from the admin namespace.
                  // The old "delivery declared with neither nationwide nor
                  // cities" hole cannot be reached from here any more: this
                  // step no longer collects either, and the dashboard editor
                  // that does owns that validation.
                  if (!form.fulfilment) {
                    setFulfilmentError(t("auth.register.producer.fields.fulfilment.required"));
                    return;
                  }
                  setStepError("");
                  setStep(STEP.CATEGORY);
                }}
                variant="primary" size="lg" className="flex-1"
              >
                {t("auth.register.producer.actions.next")}
              </Button>
            </div>
          </div>
  );
}
