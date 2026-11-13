"use client";

/**
 * Module:   RecommendClient
 * Purpose:  The public form a visitor uses to recommend a business that is not
 *           on Mehamakor yet. Posts to POST /business-suggestions, which files
 *           it as an outreach lead for the team to work by hand.
 * Touches:  POST /business-suggestions (anonymous or authenticated).
 * Does NOT: publish anything, create a producer, or tell the visitor whether
 *           the business is already in the outreach queue — every outcome
 *           renders the same success panel, because the endpoint answers the
 *           same body either way (see business_suggestions.py).
 * Related:  app/[locale]/contact/ContactClient.jsx (the public-form pattern
 *           this follows); components/CitySearch.jsx (MEH-1767 canonical
 *           component); backend/app/routers/business_suggestions.py.
 * History:  MEH-2633 (creation, chunk B).
 *
 * THE FIVE STATES (CLAUDE.md conditional-UI rule)
 * -----------------------------------------------
 *   idle          form, nothing pending
 *   submitting    button disabled + "בשליחה..."; blocks a double submit
 *   success       form replaced by the thank-you panel
 *   error         form kept, generic message above the button
 *   rate_limited  form kept, its OWN message (429) — deliberately not folded
 *                 into `error`, because "try again in an hour" and "try again
 *                 in a moment" are opposite instructions
 *
 * `error_contact_missing` is a sixth, FIELD-level message rather than a form
 * state: it is caught client-side so a visitor who filled nothing in the
 * contact group is told immediately instead of after a round trip. The server
 * enforces the same rule (422), so disabling JS does not bypass it.
 */

import SeedBurst from "@/components/brand/SeedBurst";
import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Input from "@/components/ui/Input";
import CitySearch from "@/components/CitySearch";
import CollectionNotice from "@/components/CollectionNotice";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import BusinessCtaLink from "@/components/BusinessCtaLink";
import ShareClient from "@/app/[locale]/share/ShareClient";

const EMPTY = {
  name: "",
  city: "",
  instagram: "",
  phone: "",
  website: "",
  reason: "",
  suggester_name: "",
  suggester_email: "",
  wants_update: false,
  company: "",
};

// MEH-2827 PR 4: the zero-result links arrive with ?name= / ?city=. A query
// string is visitor-controlled text, so it is reduced to one plain line:
// control characters and angle brackets dropped, whitespace collapsed, capped.
// React escapes on render either way; this keeps the FIELD clean, since the
// value is what gets posted.
const PREFILL_CAP = { name: 200, city: 80 };

function prefillValue(raw, cap) {
  if (typeof raw !== "string") return "";
  const plain = Array.from(raw, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 || ch === "<" || ch === ">" ? " " : ch;
  }).join("");
  // Capped on code points (Array.from), so an emoji at the boundary is never
  // cut into half a surrogate pair.
  return Array.from(plain.replace(/\s+/g, " ").trim())
    .slice(0, cap)
    .join("")
    .trim();
}

export default function RecommendClient() {
  const t = useTranslations("recommend");
  // REUSES contact's approved strings rather than adding copy: the submitting
  // label and the privacy line are identical in meaning on both forms, and one
  // owner per string is the house rule (ContactClient.jsx:22-24 does the same
  // with two other namespaces).
  const tContact = useTranslations("contact");
  // MEH-2633 (Sapir 04/11): the notice-at-collection line. It lives in the
  // shared privacy namespace with the other seven, because the RULE is
  // site-wide even though the sentence is per-surface.
  const tNotice = useTranslations("privacy.collection_notice");
  // MEH-2827 PR 5: the owner line under the subtitle (recommend a store /
  // sign up your store, side by side). Both strings already approved.
  const tHome = useTranslations("home.cta");
  const tJoin = useTranslations("join");
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState("idle");
  const [contactError, setContactError] = useState(false);
  // Captured at submit time: the success copy differs by whether an update was
  // asked for, and clearing the form must not retroactively change the panel.
  const [thanked, setThanked] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // Read once on mount, not via useSearchParams: that hook would need a
  // Suspense boundary in page.js, which is outside this change. A prefill
  // never overwrites what the visitor already typed.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const name = prefillValue(q.get("name"), PREFILL_CAP.name);
    const city = prefillValue(q.get("city"), PREFILL_CAP.city);
    if (!name && !city) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || name,
      city: prev.city || city,
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hasContact = Boolean(
      form.instagram.trim() || form.phone.trim() || form.website.trim()
    );
    setContactError(!hasContact);
    if (!hasContact) return;

    setStatus("submitting");
    try {
      await api.post("/business-suggestions", form);
      setThanked(form.wants_update);
      setStatus("success");
      setForm(EMPTY);
    } catch (err) {
      setStatus(err.response?.status === 429 ? "rate_limited" : "error");
    }
  };

  if (status === "success") {
    return (
      // MEH-2827 PR 5: no min-h-screen — the share section follows the
      // thank-you panel, so a full-screen floor would only add an empty band.
      <section>
        <div className="max-w-2xl mx-auto px-4 py-16">
          {/* MEH-2833 (seed layer, board 5 v2): the thank-you moment opens
              with the seeds, light set on cream, above the success panel.
              MEH-2844 (Sapir 08/11): the burst is the one success mark — the
              ✓ (CheckCircle) under it made two, so it is gone. */}
          <SeedBurst variant="light" className="mb-2" />
          <div className="text-center" data-testid="recommend-success">
            <p className="text-fg-muted" role="status">
              {thanked ? t("success_wants_update") : t("success")}
            </p>
          </div>
          <ShareClient />
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="md:bg-surface md:rounded-lg md:p-8 md:border md:border-border md:shadow-sm">
          {/* MEH-2827 (FinalRecommend): the standard page title — start-aligned,
              fluid size, the same classes as /about/why-local's h1. The 5xl
              centred title broke into three lines on a phone. */}
          <h1 className="font-headline-lg mb-3 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black text-start">
            {t("title")}
          </h1>
          <p className="text-fg-muted text-start mb-0">{t("subtitle")}</p>
          {/* MEH-2827 PR 5 — owner line (Too Good To Go: «recommend a store»
              beside «sign up your store»). A text link, not a button, so the
              form stays the primary action. BusinessCtaLink: a producer sees
              «לוח הבקרה שלי», an admin sees no link. */}
          <p className="mt-3 mb-8 flex flex-wrap items-baseline gap-x-2 text-base text-start" data-testid="recommend-owner-line">
            <span className="text-fg-muted">{tHome("heading")}</span>
            <BusinessCtaLink
              href="/join"
              data-testid="recommend-owner-link"
              className="inline-flex items-center gap-1 min-h-touch font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {tJoin("cta")}
              <ArrowLeft size={15} className="ltr:rotate-180" aria-hidden="true" />
            </BusinessCtaLink>
          </p>

          {/* No `noValidate` (adversarial review, finding 2). ui/Input
              forwards `required` as the NATIVE attribute, and MEH-2015 records
              that intercepting it was a measured regression: the browser gate
              IS the empty-field gate on this repo's public forms. With
              noValidate an empty business name posted and came back 422, which
              surfaced the generic error instead of naming the field.
              City is a separate matter: CitySearch sets aria-required only
              (CitySearch.jsx:286), not the native attribute, so an empty city
              still falls through to the server's 422 — the same behaviour
              every other CitySearch form in the repo has. Not changed here;
              it would mean editing the canonical component. */}
          <form onSubmit={handleSubmit} data-testid="recommend-form" data-chat-hide="">
            <Input
              id="recommend-name"
              label={t("field_name_label")}
              value={form.name}
              onChange={set("name")}
              maxLength={200}
              required
            />

            {/* MEH-1767 canonical component — a hand-rolled city input is what
                put a city outside the map filter (MEH-1455). */}
            <div className="mt-4">
              <CitySearch
                id="recommend-city"
                label={t("field_city_label")}
                labelVisible
                required
                value={form.city}
                onChange={(next) => setForm((prev) => ({ ...prev, city: next }))}
              />
            </div>

            <fieldset
              className="mt-6"
              aria-describedby={contactError ? "recommend-contact-error" : undefined}
            >
              <legend className="block text-sm font-medium text-text">
                {t("field_contact_label")}
              </legend>
              <p className="text-xs text-fg-muted mt-1 mb-2">{t("field_contact_hint")}</p>
              <Input
                id="recommend-instagram"
                label={t("field_instagram_label")}
                value={form.instagram}
                onChange={set("instagram")}
                maxLength={100}
              />
              <div className="mt-3">
                <Input
                  id="recommend-phone"
                  type="tel"
                  label={t("field_phone_label")}
                  value={form.phone}
                  onChange={set("phone")}
                />
              </div>
              <div className="mt-3">
                <Input
                  id="recommend-website"
                  type="url"
                  label={t("field_website_label")}
                  value={form.website}
                  onChange={set("website")}
                  maxLength={200}
                />
              </div>
              {/* The rule is about the GROUP — any one of the three satisfies
                  it — so the message belongs to the fieldset, not to a field.
                  It was first hung on `error` of the instagram Input, which
                  red-bordered that one box and read as "instagram is invalid",
                  contradicting the hint right above it. Caught by reading the
                  375 capture (rule 23), not by any test. role="alert" so it is
                  announced; aria-describedby ties it to the whole group. */}
              {contactError && (
                <p
                  id="recommend-contact-error"
                  role="alert"
                  className="mt-2 text-sm text-error"
                  data-testid="recommend-contact-error"
                >
                  {t("error_contact_missing")}
                </p>
              )}
            </fieldset>

            <div className="mt-6">
              <Input
                id="recommend-reason"
                label={t("field_reason_label")}
                value={form.reason}
                onChange={set("reason")}
                maxLength={1000}
              />
            </div>
            <div className="mt-4">
              <Input
                id="recommend-suggester-name"
                label={t("field_suggester_name_label")}
                value={form.suggester_name}
                onChange={set("suggester_name")}
                maxLength={100}
              />
            </div>
            <div className="mt-4">
              <Input
                id="recommend-suggester-email"
                type="email"
                label={t("field_suggester_email_label")}
                value={form.suggester_email}
                onChange={set("suggester_email")}
              />
              {/* Privacy Protection Law Amendment 13 §11: the notice sits AT
                  the point of collection — directly under the field, not only
                  in a policy — and states purpose + who it does not go to.
                  Sapir approved this wording 04/11. The link label is
                  surface-owned (`recommend.privacy_link`) because the approved
                  text is «מדיניות הפרטיות», while the shared register-page
                  label reads «למדיניות הפרטיות»; reusing that would alter
                  approved copy, editing it would alter the register pages. */}
              <CollectionNotice
                message={tNotice("business_suggestion")}
                linkLabel={t("privacy_link")}
                testId="recommend-collection-notice"
              />
            </div>

            <label className="flex items-center gap-2 mt-4 text-sm text-text">
              <input
                type="checkbox"
                checked={form.wants_update}
                onChange={(e) => setForm({ ...form, wants_update: e.target.checked })}
                data-testid="recommend-wants-update"
              />
              {t("wants_update_label")}
            </label>

            {/* HONEYPOT. Hidden from sighted users AND from assistive tech
                (aria-hidden + tabIndex -1), so no human can reach it and any
                value in it means an automated submitter. The server answers
                201 and stores nothing — never a 4xx, which would tell the bot
                what tripped it. `company` because that is the field name form
                -filling bots most reliably populate. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="company">company</label>
              <input
                id="company"
                name="company"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.company}
                onChange={set("company")}
              />
            </div>

            {status === "error" && (
              <p className="mt-4 text-sm text-error" role="alert" data-testid="recommend-error">
                {t("error_generic")}
              </p>
            )}
            {status === "rate_limited" && (
              <p className="mt-4 text-sm text-error" role="alert" data-testid="recommend-rate-limited">
                {t("error_rate_limited")}
              </p>
            )}

            <Button
              type="submit"
              disabled={status === "submitting"}
              data-testid="recommend-submit"
              variant="primary" size="lg" className="mt-6 w-full"
            >
              {status === "submitting" ? tContact("submit_loading") : t("submit")}
            </Button>

            {/* t.rich, NOT t(): this string carries <link> markup and a plain
                t() prints the tags on screen. ContactClient.jsx:173 is the
                reference. A test whose i18n mock returns a tag-free string
                cannot see this — which is how it got here first time round. */}
            <p className="mt-4 text-xs text-fg-muted">
              {tContact.rich("privacy_notice", {
                link: (chunks) => (
                  <Link href="/privacy" className="text-primary underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </form>
          <ShareClient />
        </div>
      </div>
    </section>
  );
}
