"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Leaf, Envelope, Timer } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Input from "@/components/ui/Input";
import CollectionNotice from "@/components/CollectionNotice";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { CONTACT_EMAIL } from "@/lib/env.client";
import Button from "@/components/ui/Button";
import { CONTACT_TOPICS, DEFAULT_CONTACT_TOPIC, contactTopicFrom } from "@/lib/contact-topics";
import SectionHeading from "@/components/ui/SectionHeading";

// MEH-653: CONTACT_EMAIL now read from NEXT_PUBLIC_CONTACT_EMAIL (lib/env.client)
// with a "contact@mehamakor.co.il" fallback. Must still match the backend
// CONTACT_EMAIL env var (backend/.env.example, backend/app/config.py::
// Settings.contact_email) so the visible address matches where POST /contact
// actually delivers.

const EMPTY_FORM = { name: "", email: "", message: "", topic: DEFAULT_CONTACT_TOPIC };

export default function ContactClient() {
  const t = useTranslations("contact");
  // MEH-1981: same namespace pair CategoryRequestModal.jsx:17-18 uses — one
  // privacy-link label site-wide, not a new string.
  const tNotice = useTranslations("privacy.collection_notice");
  const tPrivacyLink = useTranslations("auth.register.consumer.terms");
  const [form, setForm] = useState(EMPTY_FORM);
  // MEH-2832 (moved from /about, MEH-1113): every «כתבו לנו» on the site links
  // here with ?topic=. A whitelisted value preselects the topic; anything else
  // falls back to "general" silently. Read once on mount, client-side only
  // (MEH-517) — useSearchParams would need a Suspense boundary in page.js
  // (the RecommendClient prefill pattern).
  useEffect(() => {
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic) setForm((prev) => ({ ...prev, topic: contactTopicFrom(topic) }));
  }, []);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await api.post("/contact", form);
      setStatus("success");
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus("error");
      setErrorMsg(detailToMessage(err.response?.data?.detail) || t("error_default"));
    }
  };

  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    t("mailto_subject")
  )}&body=${encodeURIComponent(
    `${t("mailto_body_prefix")} ${form.name}\n${t("mailto_body_email")} ${form.email}\n\n${form.message}`
  )}`;

  return (
    <section className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* MEH-2565: card from md up only — on a phone the form uses the full width. */}
        <div className="md:bg-surface md:rounded-lg md:p-8 md:border md:border-border md:shadow-sm">
          {/* MEH-2827 (FinalContact): the standard page title, start-aligned. */}
          <h1 className="font-headline-lg mb-3 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black text-start">
            {t("title")}
          </h1>
          {/* MEH-2571: the "3 business days" line that sat here repeated the
              response_sla row in the box below — said once now, in the box. */}
          <p className="text-fg-muted text-start mb-8">
            {t("subtitle")}
          </p>

          <div className="bg-green-50/60 border border-border rounded-md p-4 mb-6 text-sm">
            <p className="flex items-center gap-2 flex-wrap">
              <Envelope size={16} className="text-primary" aria-hidden="true" />
              <span>{t("email_label")}</span>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current font-medium break-all"
                dir="ltr"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p className="flex items-center gap-2 mt-2">
              <Timer size={16} className="text-primary" aria-hidden="true" />
              <span>{t("response_sla")}</span>
            </p>
          </div>

          {status === "success" ? (
            <div className="text-center py-8">
              <div className="mb-4 flex justify-center">
                <CheckCircle size={64} weight="fill" className="text-primary" aria-hidden="true" />
              </div>
              <SectionHeading size="content" className="mb-2">
                {t("success_title")}
              </SectionHeading>
              <p className="text-fg-muted inline-flex items-center gap-1.5">
                {t("success_message")}
                <Leaf size={14} className="text-primary" aria-hidden="true" />
              </p>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="mt-6 text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current text-sm"
              >
                {t("success_send_another")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} data-chat-hide="" className="space-y-4">
              {/* MEH-1145 Wave E2: plain labeled fields → ui/Input (canon 44px
                  boxed recipe; value/onChange/required pass through unchanged). */}
              <Input
                id="contact-name"
                type="text"
                label={t("field_name_label")}
                value={form.name}
                onChange={set("name")}
                required
              />
              <Input
                id="contact-email"
                type="email"
                label={t("field_email_label")}
                value={form.email}
                onChange={set("email")}
                required
                dir="ltr"
              />
              {/* MEH-2832: topic select (moved from the /about form, MEH-1113).
                  Sent in the POST body; the backend prepends «נושא: <label>». */}
              <div>
                <label htmlFor="contact-topic" className="block text-sm font-medium mb-1 text-text">
                  {t("topic_label")}
                </label>
                <select
                  id="contact-topic"
                  data-testid="contact-topic"
                  value={form.topic}
                  onChange={set("topic")}
                  className="w-full min-h-touch bg-surface-card border border-border rounded-sm px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {CONTACT_TOPICS.map((key) => (
                    <option key={key} value={key}>
                      {t(`topic_options.${key}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-sm font-medium mb-1 text-text">
                  {t("field_message_label")}{" "}
                  <span className="text-error" aria-hidden="true">
                    *
                  </span>
                </label>
                <textarea
                  id="contact-message"
                  value={form.message}
                  onChange={set("message")}
                  required
                  rows={5}
                  className="w-full border border-border rounded-sm px-3 py-2 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {/* MEH-1981: notice-at-collection (Privacy Law Amendment 13 §11)
                  — purpose + recipient of what is typed above, at the point of
                  collection. The `privacy_notice` line under the submit button
                  stays: it carries the consent wording, this carries the
                  purpose. Copy derived from the five lines approved 02/09. */}
              <CollectionNotice
                message={tNotice("contact")}
                linkLabel={tPrivacyLink("privacy_link")}
                testId="contact-collection-notice"
              />

              {status === "error" && (
                <div className="text-sm text-danger-600 bg-danger-50 rounded-md p-3">
                  <p>{errorMsg}</p>
                  <a
                    href={mailtoHref}
                    className="text-primary hover:underline inline-block mt-2"
                  >
                    {t("open_mail_fallback")}
                  </a>
                </div>
              )}

              <Button
                type="submit"
                disabled={status === "loading"}
                variant="primary" size="lg" className="w-full"
              >
                {status === "loading" ? t("submit_loading") : t("submit")}
              </Button>

              <p className="text-xs text-fg-muted text-center">
                {t.rich("privacy_notice", {
                  link: (chunks) => (
                    <Link href="/privacy" className="text-primary underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
