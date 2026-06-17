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
import { CaretDown, ArrowLeft, PaperPlaneTilt } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
// MEH-788: gentle scroll-reveal on the content sections (hero excluded — LCP).
import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";

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
// MEH-841: 3-stop comparison path (gold-dot spine). Order is the locked
// editorial order — do not re-sort.
const COMPARE_STOPS = ["row1", "row2", "row3"];

export default function AboutPage() {
  const t = useTranslations("about.consumer");
  // MEH-534: cross-link label to the /about/process page (process namespace).
  const tProcess = useTranslations("process");
  // MEH-841: comparison strip ported from home — sibling namespace, not consumer.*
  const tCompare = useTranslations("about.comparison");
  // MEH-848: shared generic error copy (collapsed from about.consumer.contact.error_toast).
  const tError = useTranslations("error");
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
      setContactMsg(error.response?.data?.detail || tError("generic"));
    }
  };

  // text-only section marker label, start-aligned (RTL-safe). No rule — tonal
  // blocks (bg-background-alt) do the separation now. fg-muted keeps AA on BOTH
  // cream and background-alt (accent gold fails 4.5:1 at this size). Label is a
  // <p> by default so it never outranks the section h2; pass as="h2" where the
  // label IS the section heading (Benefits).
  const Eyebrow = ({ children, as: Tag = "p" }) => (
    <Tag className="block font-body-md text-[13px] font-semibold tracking-[0.15em] text-fg-muted uppercase mb-3 md:mb-4">
      {children}
    </Tag>
  );

  return (
    <div className="relative bg-background">
      {/* ======== 01 — Hero (cream editorial · anchored) ======== */}
      <section className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <h1 className="font-headline-display font-black text-text tracking-tight leading-[1.05] text-[clamp(28px,5vw,52px)] max-w-[15ch]">
            {t("hero.heading")}
          </h1>
          <p className="mt-4 font-body-md text-[17px] md:text-lg text-text/90 leading-relaxed max-w-[46ch]">
            {t("hero.subheading")}
          </p>
        </div>
      </section>

      {/* ======== 02 — Sapir's story (prose start · portrait standfirst end) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-12 md:gap-[72px] items-start">
            {/* prose — sits at start edge in RTL */}
            <div className="font-body-md text-[17px] text-text/90 leading-[1.75] space-y-5 max-w-[64ch]">
              <p className="font-headline-md font-bold text-text text-2xl md:text-[25px] !mb-2">
                {t("story.greeting")}
              </p>
              <p className="text-fg-muted">{t("story.p1")}</p>
              <p>{t("story.p2")}</p>
              <p>{t("story.p3")}</p>
              <p>{t("story.p4")}</p>
              <p>{t("story.p5")}</p>
            </div>
            {/* portrait standfirst — sticky on desktop. MEH-788 S14: IMG-01
                framed PLATE — warm-white mat + hairline + an offset
                background-alt panel behind it (depth by overlap, zero shadows).
                The current image is kept until the matte IMG-01 founder
                portrait lands (swap the src then); the plate treatment is the
                visual port. */}
            <figure className="m-0 md:sticky md:top-10 max-w-[280px] md:max-w-[360px]">
              <div className="relative">
                {/* offset panel behind the mat */}
                <div
                  className="absolute -bottom-3 -end-3 w-full h-full rounded-lg bg-background-alt border border-border"
                  aria-hidden="true"
                />
                {/* mat + hairline + the 3:4 image */}
                <div className="relative rounded-lg bg-surface-card border border-border p-2">
                  {/* IMG-01: empty/failed state is a tonal background-alt
                      plate (no leaf box). The matte founder portrait drops in
                      when its Cloudinary ID lands; current image kept meanwhile. */}
                  <div
                    className="relative w-full aspect-[3/4] rounded-md overflow-hidden bg-background-alt"
                    aria-label={t("story.image_aria")}
                  >
                    {imgFailed ? null : (
                      <Image
                        src="https://res.cloudinary.com/dfzpscjks/image/upload/f_auto,q_auto,c_fill,g_auto,ar_3:4/v1777302486/WhatsApp_Image_2026-04-27_at_18.07.36_dl4ldr.jpg"
                        alt={t("story.image_alt")}
                        fill
                        sizes="(min-width: 768px) 360px, 280px"
                        className="object-cover object-[center_30%]"
                        priority={false}
                        onError={() => setImgFailed(true)}
                      />
                    )}
                  </div>
                </div>
              </div>
              <figcaption className="mt-4 border-s-2 border-accent ps-4 max-w-[320px] space-y-1.5">
                {/* credit — small muted role line */}
                <p className="font-body-md text-sm text-fg-muted leading-snug">
                  {t("story.caption1")}
                </p>
                {/* personal accent — distinct role, slightly larger, full text color */}
                <p className="font-body-md text-[15px] text-text font-medium leading-snug">
                  {t("story.caption3")}
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </FadeInSection>

      {/* ======== Pull-quote divider (cream · offset to start edge · upright FRL) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <blockquote className="font-headline-display font-normal text-primary-dark border-s-2 border-accent ps-6 md:ps-8 me-auto max-w-[16ch] md:max-w-[18ch] text-[clamp(28px,7vw,48px)] leading-[1.18] tracking-tight">
            {t("parallax.quote")}
          </blockquote>
        </div>
      </FadeInSection>

      {/* ======== Comparison — layout A (3-stop gold-dot path) · MEH-841 (supersedes MEH-525) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Eyebrow>{tCompare("eyebrow")}</Eyebrow>
          <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight mb-8 md:mb-10">
            {tCompare("heading")}
          </h2>
          {/* vertical gold-dot spine — hairline border on the start edge; dots are CSS, no icons */}
          <ol className="relative ms-1 border-s border-border space-y-8 md:space-y-10">
            {COMPARE_STOPS.map((row) => (
              <li key={row} className="relative ps-6 md:ps-8">
                <span
                  aria-hidden="true"
                  className="absolute start-0 top-1.5 -ms-[5px] block w-2.5 h-2.5 rounded-full bg-accent"
                />
                <p className="font-headline-md font-bold text-primary-dark text-[21px] md:text-2xl leading-snug">
                  {tCompare(`${row}_brand`)}
                </p>
                <p className="font-body-md text-fg-muted text-base leading-relaxed mt-1.5">
                  {tCompare(`${row}_super`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </FadeInSection>

      {/* ======== 03 — Benefits (alt-tone block w/ Values · centered gold numerals) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <Eyebrow as="h2">{t("benefits.heading")}</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
            {BENEFITS.map(({ key, n }) => (
              <div key={key} className="text-center">
                <span aria-hidden className="font-english italic font-semibold text-accent text-3xl md:text-[34px] block mb-3.5">
                  {n}
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
      </FadeInSection>

      {/* ======== 04 — Values (bordered editorial container · gold numerals) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Eyebrow>{t("values.eyebrow")}</Eyebrow>
          <div className="border-2 border-accent/30 rounded-3xl p-8 md:p-14">
            <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight">
              {t("values.heading")}
            </h2>
            <p className="font-body-md text-fg-muted text-lg leading-relaxed mt-4 max-w-[54ch]">
              {t("values.intro")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-7 md:gap-x-14 md:gap-y-9 mt-8">
              {VALUES.map(({ key, n }) => (
                <article key={key}>
                  <span aria-hidden className="font-english italic font-semibold text-accent text-2xl block mb-1">
                    {n}
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
      </FadeInSection>

      {/* ======== 05 — Tips accordion ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Eyebrow>{t("tips.eyebrow")}</Eyebrow>
          <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight">
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
      </FadeInSection>

      {/* ======== 06 — Testimonials (slim invitation band) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12 text-center">
          <div className="border-y border-border py-12 md:py-14">
            <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight max-w-[18ch] mx-auto">
              {t("testimonials.heading")}
            </h2>
            <p className="font-body-md text-fg-muted text-base md:text-lg mt-4 max-w-[42ch] mx-auto">
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
      </FadeInSection>

      {/* ======== 07 — Close (consumer-primary CTA · business demoted) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-green-50 border-y border-border py-9 md:py-14 scroll-mt-24">
        <div className="max-w-2xl mx-auto px-4 text-center">
          {/* single primary CTA — consumer */}
          <Link
            href="/map"
            className="inline-flex items-center gap-2 min-h-[56px] px-9 py-4 bg-primary text-white rounded-lg font-semibold text-lg hover:bg-primary-dark transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
          >
            {t("cta.explore")}
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          {/* demoted business action → business hub (cta.heading kept verbatim) */}
          <p className="mt-6 font-body-md text-sm text-fg-muted max-w-[44ch] mx-auto leading-relaxed">
            {t("cta.heading")}{" "}
            <Link
              href="/about/for-businesses"
              className="text-primary font-semibold underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t("cta.register")}
            </Link>
          </p>
          {/* MEH-534: cross-link to the S11 acceptance-process page */}
          <p className="mt-4">
            <Link
              href="/about/process"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {tProcess("crosslink_from_about")}
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </FadeInSection>

      {/* ======== 08 — Contact form ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-2xl mx-auto px-4 md:px-12">
          <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight">
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
      </FadeInSection>

      {/* Subtle film grain — tactile warmth over the cream. Inline SVG feTurbulence
          (monochrome, data-URI, LCP-safe), pointer-events-none, ~3.5% so it reads as
          depth, not visible noise. Top film (not a behind-bg layer) because the tonal
          section fills are opaque — a layer behind them wouldn't show through. Scoped
          to /about via absolute inset-0 on this relative root; full-bleed, RTL-neutral. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='aboutGrain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23aboutGrain)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  );
}
