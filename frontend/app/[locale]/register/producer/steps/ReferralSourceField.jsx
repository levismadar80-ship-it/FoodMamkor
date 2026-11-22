// @ts-check
/**
 * ReferralSourceField — «מאיפה שמעתם עלינו?» (MEH-1471), optional since
 * MEH-2183. Moved verbatim out of StoryStep.jsx (MEH-3697) so the business
 * path, which lost the story step in MEH-3656, asks it on its last step too.
 * Every value arrives as a prop; this file holds no hooks.
 */
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { REFERRAL_SOURCE_KEYS } from "../registerProducerShared";

/** @param {Record<string, any>} props */
export default function ReferralSourceField({ form, set, setAndSave, t }) {
  /* MEH-1471: self-reported attribution — dropdown directly above
      the ToS consent (final step). Default "בחרו אפשרות" with no
      preselection (Ruler Analytics speed-bias → first-option overcount).
      Selecting "other" reveals an optional free-text input. English
      keys stored; Hebrew from i18n.
      MEH-2183: OPTIONAL — leaving it empty no longer blocks submit.  */
  return (
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
  );
}
