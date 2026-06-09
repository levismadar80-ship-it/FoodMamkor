/* eslint-disable max-lines, max-lines-per-function */
"use client";

/**
 * AboutClient — consumer /about page.
 * S8 Direction D "Feature Standfirst": editorial cream longread —
 * hero · founder story (portrait standfirst) · cream pull-quote ·
 * 3-pillar benefits (gold numerals) · tips accordion · testimonials
 * invitation band · values (bordered box) · CTA · contact form.
 * Visual restyle only — every string resolves from about.consumer.* keys.
 * History: MEH-100 (founder portrait); MEH-135 (S8 Direction D port).
 */

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Leaf, CaretDown, ArrowLeft, PaperPlaneTilt } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";

const TIP_KEYS = ["eggs", "grass_fed", "honey"];
// gold Cormorant numerals — decorative, aria-hidden
const BENEFITS = [
  { key: "local", n: "01" },
  { key: "trust", n: "02" },
  { key: "community", n: "03" },
];
const VALUES = [
  { key: "transparency", n: "01" },
  { key: "proximity", n: "02" },
  { key: "quality", n: "03" },
  { key: "safety", n: "04" },
];

export default function AboutPage() {
  const t = useTranslations("about.consumer");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [contactStatus, setContactStatus] = useState(null);
  const [contactMsg, setContactMsg] = useState("");
  const [openTip, setOpenTip] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const handleContact = async (event) => {
    event.preventDefault();
    setContactStatus("loading");
    setContactMsg("");
    try {
      await api.post("/contact", form);
      setContactStatus("success");
      setContactMsg(t("contact.success_toast"));
      setForm({ name: "", email: "", message: "" });
    } catch (error) {
      setContactStatus("error");
      setContactMsg(error.response?.data?.detail || t("contact.error_toast"));
    }
  };

  // thin gold top-rule — editorial section marker (decorative)
  const Rule = () => (
    <div aria-hidden className="h-px w-12 bg-accent/70 mb-5" />
  );

  return (
    <div className="bg-background">
      {/* ======== 01 — Hero (cream editorial) ======== */}
      <section className="bg-background section-y">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <h1 className="font-headline-display font-black text-text tracking-tight leading-[1.02] text-[clamp(33px,9vw,72px)] max-w-[15ch]">
            {t("hero.heading")}
          </h1>
          <p className="mt-6 font-body-md text-lg md:text-xl text-text/90 leading-relaxed max-w-[46ch]">
            {t("hero.subheading")}
          </p>
        </div>
      </section>

      {/* ======== 02 — Sapir's story (prose start · portrait standfirst end) ======== */}
      <section className="bg-background section-y">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-12 md:gap-[72px] items-start">
            {/* prose — sits at start edge in RTL */}
            <div className="font-body-md text-lg text-text/90 leading-[1.8] space-y-5">
              <p className="font-headline-md font-bold text-text text-2xl md:text-[32px] !mb-2">
                {t("story.greeting")}
              </p>
              <p className="text-fg-muted">{t("story.p1")}</p>
              <p>{t("story.p2")}</p>
              <p>{t("story.p3")}</p>
              <p>{t("story.p4")}</p>
              <p>{t("story.p5")}</p>
            </div>
            {/* portrait standfirst — sticky on desktop */}
            <figure className="m-0 md:sticky md:top-10">
              <div
                className="relative w-full max-w-[280px] md:max-w-[360px] aspect-[3/4] rounded-lg border border-border overflow-hidden bg-green-50 flex items-center justify-center"
                aria-label={t("story.image_aria")}
              >
                {imgFailed ? (
                  <Leaf size={120} weight="duotone" className="text-primary" aria-hidden="true" />
                ) : (
                  <Image
                    src="https://res.cloudinary.com/dfzpscjks/image/upload/f_auto,q_auto,c_fill,g_auto,ar_3:4/v1777302486/WhatsApp_Image_2026-04-27_at_18.07.36_dl4ldr.jpg"
                    alt={t("story.image_alt")}
                    fill
                    sizes="(min-width: 768px) 360px, 280px"
                    className="object-cover"
                    priority={false}
                    onError={() => setImgFailed(true)}
                  />
                )}
              </div>
              <figcaption className="mt-5 border-s-2 border-accent ps-5 max-w-[360px] space-y-2">
                <p className="font-english italic text-lg text-text leading-snug">
                  {t("story.caption1")}
                </p>
                <p className="font-english italic text-lg text-text leading-snug">
                  {t("story.caption3")}
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ======== Pull-quote divider (cream · offset to start edge) ======== */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <Rule />
          <blockquote className="font-headline-display italic font-medium text-primary-dark border-s-2 border-accent ps-6 md:ps-8 me-auto max-w-[16ch] md:max-w-[18ch] text-[clamp(29px,8vw,54px)] leading-[1.18] tracking-tight">
            {t("parallax.quote")}
          </blockquote>
        </div>
      </section>

      {/* ======== 03 — Benefits (cream canvas · gold numerals) ======== */}
      <section className="bg-background section-y">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <Rule />
          <h2 className="font-headline-md font-bold text-fg-muted text-xs tracking-[0.18em] uppercase mb-8">
            {t("benefits.heading")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
            {BENEFITS.map(({ key, n }) => (
              <div key={key}>
                <span aria-hidden className="font-english italic font-semibold text-accent text-3xl md:text-[34px] block mb-3.5">
                  {n}<span className="opacity-55">—</span>
                </span>
                <h3 className="font-headline-md font-bold text-text text-[22px] leading-tight mb-2.5">
                  {t(`benefits.${key}.title`)}
                </h3>
                <p className="font-body-md text-base text-fg-muted leading-relaxed whitespace-pre-line">
                  {t(`benefits.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======== 04 — Tips accordion ======== */}
      <section className="bg-background section-y">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Rule />
          <h2 className="font-headline-lg font-bold text-text text-[clamp(28px,5vw,32px)] leading-tight">
            {t("tips.heading")}
          </h2>
          <div className="mt-8 border-t border-border">
            {TIP_KEYS.map((key, i) => (
              <div key={key} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setOpenTip(openTip === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 font-headline-md font-bold text-lg text-text rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-expanded={openTip === i}
                  aria-controls={`tip-panel-${i}`}
                >
                  <span>{t(`tips.${key}.question`)}</span>
                  <CaretDown
                    size={20}
                    weight="bold"
                    aria-hidden="true"
                    className={`text-accent shrink-0 transition-transform duration-base ease-quart ${
                      openTip === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openTip === i && (
                  <div
                    id={`tip-panel-${i}`}
                    className="pb-6 font-body-md text-base text-fg-muted leading-relaxed max-w-[58ch]"
                  >
                    {t(`tips.${key}.answer`)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======== 05 — Testimonials (slim invitation band) ======== */}
      <section className="bg-background section-y">
        <div className="max-w-3xl mx-auto px-4 md:px-12 text-center">
          <div className="border-y border-border py-12 md:py-14">
            <h2 className="font-headline-lg font-bold text-text text-[clamp(28px,5vw,32px)] leading-tight max-w-[18ch] mx-auto">
              {t("testimonials.heading")}
            </h2>
            <p className="font-english italic text-fg-muted text-lg md:text-xl mt-4 max-w-[42ch] mx-auto">
              {t("testimonials.subtitle")}
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 mt-6 text-primary font-semibold hover:underline"
            >
              {t("testimonials.cta")}
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ======== 06 — Values (bordered editorial container · gold numerals) ======== */}
      <section className="bg-background section-y">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Rule />
          <div className="border border-border rounded-3xl bg-white/40 p-8 md:p-14">
            <h2 className="font-headline-lg font-bold text-text text-[clamp(28px,5vw,32px)] leading-tight">
              {t("values.heading")}
            </h2>
            <p className="font-body-md text-fg-muted text-lg leading-relaxed mt-4 max-w-[54ch]">
              {t("values.intro")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-7 md:gap-x-14 md:gap-y-9 mt-8">
              {VALUES.map(({ key, n }) => (
                <article key={key}>
                  <span aria-hidden className="font-english italic font-semibold text-accent text-2xl block mb-1">
                    {n}<span className="opacity-55">—</span>
                  </span>
                  <h3 className="font-headline-md font-bold text-text text-[21px]">
                    {t(`values.${key}.title`)}
                  </h3>
                  <p className="font-body-md text-fg-muted text-base leading-relaxed mt-2">
                    {t(`values.${key}.body`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ======== 07 — CTA for businesses ======== */}
      <section className="bg-background section-y border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline-lg font-bold text-text text-[clamp(28px,5vw,32px)] leading-tight max-w-[16ch] mx-auto">
            {t("cta.heading")}
          </h2>
          <div className="flex flex-wrap gap-3.5 justify-center mt-8">
            <Link
              href="/register/producer"
              className="inline-flex items-center gap-2 min-h-[52px] px-7 py-3.5 bg-primary text-white rounded-lg font-semibold text-base hover:bg-primary-dark transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              {t("cta.register")}
              <Leaf size={19} weight="fill" aria-hidden="true" />
            </Link>
            <Link
              href="/map"
              className="inline-flex items-center min-h-[52px] px-7 py-3.5 bg-white text-primary border border-primary rounded-lg font-semibold text-base hover:bg-primary hover:text-white transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              {t("cta.explore")}
            </Link>
          </div>
        </div>
      </section>

      {/* ======== 08 — Contact form ======== */}
      <section className="bg-background section-y border-t border-border">
        <div className="max-w-2xl mx-auto px-4 md:px-12">
          <Rule />
          <h2 className="font-headline-lg font-bold text-text text-[clamp(28px,5vw,32px)] leading-tight">
            {t("contact.heading")}
          </h2>
          <p className="font-body-md text-fg-muted text-lg mt-3 max-w-[48ch] leading-relaxed">
            {t("contact.subtitle")}
          </p>

          <form onSubmit={handleContact} className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-6 max-w-[560px]">
            <div className="grid gap-2">
              <label htmlFor="contact-name" className="text-sm font-semibold text-text">
                {t("contact.name_label")}
              </label>
              <input
                id="contact-name"
                type="text"
                required
                placeholder={t("contact.name_placeholder")}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full bg-white border border-border rounded-sm px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="contact-email" className="text-sm font-semibold text-text">
                {t("contact.email_label")}
              </label>
              <input
                id="contact-email"
                type="email"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="w-full bg-white border border-border rounded-sm px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
                dir="ltr"
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <label htmlFor="contact-message" className="text-sm font-semibold text-text">
                {t("contact.message_label")}
              </label>
              <textarea
                id="contact-message"
                required
                rows={4}
                placeholder={t("contact.message_placeholder")}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                className="w-full bg-white border border-border rounded-sm px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition resize-y min-h-[120px] leading-relaxed"
              />
            </div>
            <button
              type="submit"
              disabled={contactStatus === "loading"}
              className="md:col-span-2 justify-self-start inline-flex items-center gap-2 min-h-[52px] px-7 py-3.5 bg-primary text-white rounded-lg font-semibold text-base hover:bg-primary-dark transition-colors duration-base disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              {contactStatus === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <ButtonSpinner />
                  {t("contact.submit_loading")}
                </span>
              ) : (
                <>
                  {t("contact.submit")}
                  <PaperPlaneTilt size={18} aria-hidden="true" />
                </>
              )}
            </button>

            {contactMsg && (
              <p
                role="status"
                aria-live="polite"
                className={`md:col-span-2 text-sm ${
                  contactStatus === "success" ? "text-primary" : "text-red-600"
                }`}
              >
                {contactMsg}
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
