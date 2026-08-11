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
// MEH-1840: locale-aware Link. next/link is NOT — with localePrefix "as-needed"
// (i18n/routing.js) a plain <Link href="/about/process"> renders that href
// verbatim, so an /en reader clicking it lands on the HEBREW page. Measured on
// /en/about (02/08): href="/about/process", click → /about/process, while
// /en/about/process exists and returns 200. Every OTHER /about/* link in this
// file has the same defect (6 of them, all pre-existing) — NOT fixed here,
// that is its own change; this import exists so MEH-1840 does not add a 7th.
import { Link as LocaleLink } from "@/i18n/navigation";
import Image from "next/image";
import { useState, useEffect } from "react";
// MEH-1113: prefill the contact-form topic from ?topic= (whitelist-guarded).
import { useSearchParams } from "next/navigation";
import { CaretDown, ArrowLeft, PaperPlaneTilt } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
// MEH-1112: visible email fallback next to the contact form (NN/g Contact-Us
// guideline #1). CONTACT_EMAIL = NEXT_PUBLIC_CONTACT_EMAIL w/ fallback (MEH-653).
import { CONTACT_EMAIL } from "@/lib/env.client";
import ButtonSpinner from "@/components/ButtonSpinner";
import { optimizeCloudinary } from "@/lib/cloudinary";
// MEH-788: gentle scroll-reveal on the content sections (hero excluded — LCP).
import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";

// MEH-2001: the story portrait. Raw asset URL — every transform is applied by
// optimizeCloudinary at the call site, never baked into this string.
const STORY_PORTRAIT =
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1777302486/WhatsApp_Image_2026-04-27_at_18.07.36_dl4ldr.jpg";
// 360px (the `sizes` cap on this image) at DPR 2. The source is 1200px wide,
// so this only ever downscales.
const STORY_PORTRAIT_WIDTH = 720;

// MEH-1112: testimonials section render-gated OFF until real testimonials
// exist (NN/g: real social proof or nothing — no empty-shelf placeholder).
// JSX + i18n keys kept intact for revival; flip to true when content lands.
const SHOW_TESTIMONIALS = false;

// MEH-1336: "איך אנחנו מאמתים" — live since the copy-approval PR (Sapir-approved
// body in he.json/en.json). The #verification anchor is the target of the
// verified-badge popover link (MEH-1334, PR #1936).
const SHOW_VERIFICATION = true;

// MEH-1113: contact-form topic whitelist (mirrors backend CONTACT_TOPIC_LABELS
// keys). "general" is the default; labels resolve from contact.topic_options.*.
const CONTACT_TOPICS = ["general", "business", "correction", "other"];

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
  const [form, setForm] = useState({ name: "", email: "", message: "", topic: "general" });
  // MEH-1113: prefill topic from ?topic= when it's a whitelisted value
  // (e.g. the /about/for-businesses "טופס יצירת הקשר" link → ?topic=business).
  const searchParams = useSearchParams();
  useEffect(() => {
    const urlTopic = searchParams.get("topic");
    if (urlTopic && CONTACT_TOPICS.includes(urlTopic)) {
      setForm((prev) => ({ ...prev, topic: urlTopic }));
    }
  }, [searchParams]);
  const [contactStatus, setContactStatus] = useState(null);
  const [contactMsg, setContactMsg] = useState("");
  // MEH-855: per-submit counter so the status live region remounts on every
  // attempt — two identical repeat errors share a message string but must
  // still re-announce to screen readers.
  const [submitCount, setSubmitCount] = useState(0);
  const [openTip, setOpenTip] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const handleContact = async (event) => {
    event.preventDefault();
    setSubmitCount((count) => count + 1);
    setContactStatus("loading");
    setContactMsg("");
    try {
      await api.post("/contact", form);
      setContactStatus("success");
      setContactMsg(t("contact.success_toast"));
      setForm({ name: "", email: "", message: "", topic: "general" });
    } catch (error) {
      setContactStatus("error");
      setContactMsg(detailToMessage(error.response?.data?.detail) || tError("generic"));
    }
  };

  // text-only section marker label, start-aligned (RTL-safe). No rule — tonal
  // blocks (bg-background-alt) do the separation now. fg-muted keeps AA on BOTH
  // cream and background-alt (accent gold fails 4.5:1 at this size). Label is a
  // <p> by default so it never outranks the section h2; pass as="h2" where the
  // label IS the section heading (Benefits).
  const Eyebrow = ({ children, as: Tag = "p" }) => (
    <Tag className="block font-body-md text-[13px] font-semibold text-fg-muted mb-3 md:mb-4">
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
                The plate frames the founder portrait below. */}
            <figure className="m-0 md:sticky md:top-10 max-w-[280px] md:max-w-[360px]">
              <div className="relative">
                {/* offset panel behind the mat */}
                <div
                  className="absolute -bottom-3 -end-3 w-full h-full rounded-lg bg-background-alt border border-border"
                  aria-hidden="true"
                />
                {/* mat + hairline + the 3:4 image */}
                <div className="relative rounded-lg bg-surface-card border border-border p-2">
                  {/* IMG-01: founder portrait. Empty/failed state falls back
                      to a tonal background-alt plate (no leaf box). */}
                  {/* MEH-1227: this wrapper carries NO aria-label and NO role.
                      It used to carry aria-label={t("story.image_aria")}, which
                      is `aria-prohibited-attr` (axe, serious) on a role-less
                      div and fails 12-axe-a11y.spec.ts on /about.
                      Naming the wrapper instead (role="img" + the label) was
                      tried and rejected: this fallback renders `null` — a bare
                      tonal plate, deliberately no Leaf box — so a name here
                      announces "תמונה של ספיר" over an empty box, and that
                      empty state is the live one while the Cloudinary images
                      401. The name belongs on the Image's own alt, which is
                      where the repo already puts it: ImageWithFallback.jsx:37-56
                      and ProducerCard.jsx:288-310 both scope role="img" to the
                      no-photo branch and leave the loaded branch a bare Image.
                      This DOES drop a name Chrome was exposing — measured via
                      CDP, the prohibited label produced `role=generic
                      name="…" ignored=false`. That is the point, not a cost:
                      a name on a generic container is what ARIA prohibits, and
                      here it named an empty box. The loaded state keeps its
                      name through the Image's alt. */}
                  <div className="relative w-full aspect-[3/4] rounded-md overflow-hidden bg-background-alt">
                    {imgFailed ? null : (
                      // MEH-2001: this src used to be a hardcoded transform
                      // string, which frontend.md forbids ("never hardcode
                      // transform params in component code") and which meant
                      // the helper's new default width could not reach it —
                      // it delivered the full original. Routed through the
                      // helper, so future transform policy lands here too.
                      //
                      // width is explicit because on the c_fill path the helper
                      // deliberately does NOT apply DEFAULT_MAX_WIDTH: c_fill +
                      // w_ can upscale a narrower original. It cannot here —
                      // measured via the Cloudinary Admin API, the source is
                      // 1200x1600 / 186KB, and `sizes` below caps display at
                      // 360px, so 720 is that at DPR 2.
                      <Image
                        src={optimizeCloudinary(STORY_PORTRAIT, {
                          aspectRatio: "3:4",
                          width: STORY_PORTRAIT_WIDTH,
                        })}
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
      {/* MEH-1112: container narrowed max-w-6xl → max-w-3xl (matches the comparison
          block below) so the offset blockquote no longer leaves >50% empty cream at 1440px. */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
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

      {/* ======== Verification — "איך אנחנו מאמתים" (MEH-1336 · render-gated until copy ✓) ========
          id="verification" is KEPT as a live anchor even though the verified-badge
          popover no longer points here — MEH-1840 retargeted that popover to
          /about/process (the canonical "how we vet" surface), and this section is now
          the summary that teases it. Existing /about#verification deep-links must keep
          resolving, so the id stays. scroll-mt-24 offsets the sticky header (same as
          #contact). */}
      {SHOW_VERIFICATION && (
        <FadeInSection id="verification" as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
          <div className="max-w-3xl mx-auto px-4 md:px-12">
            <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight">
              {t("verification.heading")}
            </h2>
            <p className="font-body-md text-fg-muted text-lg leading-relaxed mt-4 max-w-[58ch]">
              {t("verification.body")}
            </p>
            {/* MEH-1840: in-section teaser to the full acceptance process. Reuses the
                existing process.crosslink_from_about key (also rendered in the footer
                CTA row below) — no new copy. ArrowLeft points LEFT = forward in RTL,
                same convention as the badge popover's CaretLeft. */}
            <LocaleLink
              href="/about/process"
              data-testid="verification-process-link"
              className="mt-4 inline-flex items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {tProcess("crosslink_from_about")}
              <ArrowLeft size={15} aria-hidden="true" />
            </LocaleLink>
          </div>
        </FadeInSection>
      )}

      {/* ======== "בחירת העורכת" — MEH-1492 (editorial badge criteria + ADR-030 promise) ========
          id="editors-pick" is the anchor target of /about#editors-pick (the recommended-
          badge popover, BadgeRow.jsx). Mirrors the #verification section (MEH-1336); copy
          is Sapir-locked in he.json/en.json, so it renders unconditionally. */}
      <FadeInSection id="editors-pick" as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight">
            {t("editors_pick.heading")}
          </h2>
          <p className="font-body-md text-fg-muted text-lg leading-relaxed mt-4 max-w-[58ch]">
            {t("editors_pick.body")}
          </p>
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
                <div
                  id={`tip-panel-${i}`}
                  hidden={openTip !== i}
                  className="pb-6 font-body-md text-base text-fg-muted leading-relaxed max-w-[58ch]"
                >
                  {t(`tips.${key}.answer`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeInSection>

      {/* ======== 06 — Testimonials (slim invitation band) — MEH-1112 render-gated ======== */}
      {SHOW_TESTIMONIALS && (
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
      )}

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
          {/* business pitch line — muted lead-in for the demoted actions (cta.heading verbatim) */}
          <p className="mt-6 font-body-md text-sm text-fg-muted max-w-[44ch] mx-auto leading-relaxed">
            {t("cta.heading")}
          </p>
          {/* MEH-1112: two secondary actions (business hub + MEH-534 acceptance-process
              cross-link) demoted to one quiet muted row — small, underlined, non-bold —
              so only "גלו עסקים קרובים" reads as the primary CTA (per MEH-1049/MEH-907). */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 font-body-md text-sm text-fg-muted">
            <Link
              href="/about/for-businesses"
              className="underline underline-offset-4 hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t("cta.register")}
            </Link>
            <span aria-hidden="true" className="text-border">·</span>
            <Link
              href="/about/process"
              className="underline underline-offset-4 hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {tProcess("crosslink_from_about")}
            </Link>
            {/* MEH-1289: reader-facing "why local" editorial cross-link. */}
            <span aria-hidden="true" className="text-border">·</span>
            <Link
              href="/about/why-local"
              className="underline underline-offset-4 hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t("cta.why_local_link")}
            </Link>
          </div>
        </div>
      </FadeInSection>

      {/* ======== 08 — Contact form ======== */}
      {/* MEH-1113: id="contact" — anchor target for /about?topic=business#contact
          (the for-businesses "טופס יצירת הקשר" link). scroll-mt-24 offsets the sticky header. */}
      <FadeInSection id="contact" as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-2xl mx-auto px-4 md:px-12">
          <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight">
            {t("contact.heading")}
          </h2>
          <p className="font-body-md text-fg-muted text-lg mt-3 max-w-[48ch] leading-relaxed">
            {t("contact.subtitle")}
          </p>
          {/* MEH-1323: quiet cross-link to /messages ("how contacting businesses
              works") — closes the desktop ORPHAN from the MEH-1311 route audit.
              Mirrors the testimonials-CTA link treatment. */}
          <Link
            href="/messages"
            className="inline-flex items-center gap-2 mt-4 text-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            {t("messages_link")}
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>

          <form onSubmit={handleContact} className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-6 max-w-[560px]">
            {/* MEH-1145 Wave E2: plain labeled fields → ui/Input (canon). Each
                Input's flex-col root replaces the grid cell; label weight lands
                on the canon font-medium, matching /contact's form. */}
            <Input
              id="contact-name"
              type="text"
              label={t("contact.name_label")}
              autoComplete="name"
              required
              placeholder={t("contact.name_placeholder")}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              id="contact-email"
              type="email"
              label={t("contact.email_label")}
              autoComplete="email"
              required
              placeholder={t("contact.email_placeholder")}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              dir="ltr"
            />
            {/* MEH-1113: topic select — whitelisted, prefillable via ?topic=. Sent
                in the POST body; backend prepends the Hebrew label + tags the subject. */}
            <div className="grid gap-2 md:col-span-2">
              <label htmlFor="contact-topic" className="text-sm font-semibold text-text">
                {t("contact.topic_label")}
              </label>
              <select
                id="contact-topic"
                value={form.topic}
                onChange={(event) => setForm({ ...form, topic: event.target.value })}
                className="w-full bg-surface-card border border-border rounded-sm px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
              >
                {CONTACT_TOPICS.map((key) => (
                  <option key={key} value={key}>
                    {t(`contact.topic_options.${key}`)}
                  </option>
                ))}
              </select>
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
                className="w-full bg-surface-card border border-border rounded-sm px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition resize-y min-h-[120px] leading-relaxed"
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
                // MEH-855: key includes a per-submit counter so the live region
                // remounts on every attempt — even two identical errors in a row —
                // since SRs announce on insertion, not attribute/text mutation.
                key={`${contactStatus}-${submitCount}`}
                role={contactStatus === "error" ? "alert" : "status"}
                aria-live={contactStatus === "error" ? "assertive" : "polite"}
                className={`md:col-span-2 text-sm ${
                  contactStatus === "success" ? "text-primary" : "text-error"
                }`}
              >
                {contactMsg}
              </p>
            )}
          </form>

          {/* MEH-1112: visible email fallback (NN/g Contact-Us guideline #1 — a
              form-only surface reads as unreachable). break-all + dir="ltr" per the
              MEH-905 render pattern (ForgotPasswordClient / ContactClient). */}
          <p className="mt-6 font-body-md text-sm text-fg-muted">
            {t("contact.email_direct")}{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary hover:underline break-all"
              dir="ltr"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
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
