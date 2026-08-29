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

// MEH-1130: the editorial image layer. Raw asset URLs — every transform is
// applied by optimizeCloudinary at the call site, never baked into the string
// (frontend.md, the MEH-2001 rule these lines used to carry).
//
// The founder portrait that stood here is GONE from the page: "face-not-focal"
// is the governing constraint of this layer, and the signature block in the
// story section carries the personal anchor in its place. There is no
// photograph of the founder anywhere on /about any more.
const STORY_IMAGE =
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1781214925/home/feature-produce.jpg";
const DUO_REAR =
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1781214483/about/olive-oil.jpg";
// The FRONT image of the offset duo. Rendered DECORATIVE (alt=""), and that is
// a measured decision rather than an oversight: unlike the other three, this
// asset carries NO `context.alt` in Cloudinary — its context object is empty
// (Admin API, 27/08) — so the card's premise that every alt is "already
// stored" does not hold for it, and writing a Hebrew alt here would be a
// fabricated value behind a real one's styling. The pair is named by the rear
// image's alt plus the shared figcaption, which is the standard reading of an
// overlapping decorative duo. To give it a real name later: one context.alt
// write on the asset, then swap alt="" for that stored string.
const DUO_FRONT =
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1782159035/events/hero-market.jpg";

// Delivered widths. On the c_fill path w_ CAN upscale, so each stays at or
// below its source width — feature-produce 3732px · olive-oil 3000px ·
// hero-market 2400px (all measured via the Admin API). The bread entry went
// with the band it fed (MEH-2211).
const STORY_IMAGE_WIDTH = 1040;
const DUO_REAR_WIDTH = 900;
const DUO_FRONT_WIDTH = 640;

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

// MEH-1130: the numbered chapter mark that replaces the plain eyebrow on the
// five narrative sections — "0N · <label>" in gold, then a hairline gold rule
// running to the section's end edge, so the page reads as a magazine longread
// rather than a stack of blocks.
//
// COLOUR: gold-deep (#7a5a10), NOT accent (#896714), and the deviation from
// the card's "accent gold" is deliberate and measured. Against the two
// surfaces this mark renders on, accent is 4.61:1 on background (#f5f0e8)
// but only 4.14:1 on background-alt (#ede4d2) — under AA for 13px text, and
// chapters 03/04 sit on background-alt. gold-deep is 5.62:1 and 5.05:1, i.e.
// passes on both. This is the same finding the previous Eyebrow comment
// recorded from the other end (it fell back to fg-muted for it); gold-deep
// keeps the gold the card asked for and the contrast the axe spec requires.
//
// The numeral is aria-hidden — an ordinal ornament, exactly how the BENEFITS
// and VALUES numerals are already treated — so where this renders as the
// section's own heading (Benefits, as="h2") the accessible name stays the
// label alone rather than picking up the "03 · " prefix.
//
// That name is UNCHANGED from before, but not automatically, and the
// distinction matters: the old <Eyebrow as="h2"> announced
// `about.consumer.benefits.heading` and this announces
// `about.chapter.3.label`. Two different keys. They render the same string
// only because the bundles give them equal values — a fact about he.json /
// en.json, not a property of this markup, and nothing here would notice if a
// later edit moved one of them.
//
// So the claim is not carried by this comment. `AboutChapterLabelParity.test.js`
// asserts the equality for all four reused labels in both locales, and fails
// if a sixth chapter is added without a mirror entry. (Chapter 01 is exempt:
// the story section had no eyebrow, so "הסיפור" is genuinely new copy.)
function Chapter({ num, label, as: Tag = "p" }) {
  return (
    <div className="flex items-center gap-3 mb-3 md:mb-4">
      <Tag className="block font-body-md text-[13px] font-semibold text-gold-deep shrink-0">
        <span aria-hidden="true">{`${num} · `}</span>
        {label}
      </Tag>
      <span aria-hidden="true" className="h-px flex-1 bg-accent/35" />
    </div>
  );
}

// MEH-2193: chapter exit. A text link, never a button — the single primary CTA
// stays in Close, and three competing buttons mid-page would flatten that
// hierarchy. Styling and ArrowLeft (LEFT = forward in RTL) are lifted verbatim
// from the verification-process-link established in the MEH-1840 round, so the
// three exits read as one existing pattern rather than a new one.
//
// Defined at MODULE scope, not inside AboutPage. Declaring it in the body gives
// React a brand-new component type on every render of the page, and AboutPage
// re-renders on every keystroke in the contact form (it holds form,
// contactStatus, contactMsg, submitCount, openTip and imgFailed state). Each of
// those re-renders would unmount and remount all three links, throwing away the
// IntersectionObserver registrations next/link uses to prefetch. Caught by the
// CI adversarial reviewer on #3123.
function ExitLink({ href, testId, children }) {
  return (
    <LocaleLink
      href={href}
      data-testid={testId}
      className="mt-8 inline-flex items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
      <ArrowLeft size={15} aria-hidden="true" />
    </LocaleLink>
  );
}

export default function AboutPage() {
  const t = useTranslations("about.consumer");
  // MEH-534: cross-link label to the /about/process page (process namespace).
  const tProcess = useTranslations("process");
  // MEH-841: comparison strip ported from home — sibling namespace, not consumer.*
  const tCompare = useTranslations("about.comparison");
  // MEH-2192: honest freshness stamp. Literal month/year from he.json — NOT a
  // build-time date, which would re-stamp on every deploy and signal a review
  // that never happened.
  const tAbout = useTranslations("about");
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
          {/* MEH-2192: dateline. Small muted line, start-aligned like the rest
              of the hero — an E-E-A-T freshness signal a reader can check. */}
          <p
            data-testid="about-updated-at"
            className="mt-4 font-body-md text-[13px] text-fg-muted"
          >
            {tAbout("updated_at")}
          </p>
        </div>
      </section>

      {/* ======== MEH-2211 — the lede image ========
          MEH-1130 AC1 put this photograph in a SIDE BLEED next to the story
          prose. Sapir's 29/08 review cancelled that: the page opened with two
          openers in a row (a textual hero, then a chapter's opening image), a
          4:5 portrait beside a column that started ~200px below it, and three
          different content widths inside the first screen.

          A lede fixes all three at once — the Natoora our-story pattern:
          heading, then dek, then ONE image, then the prose. It reads as the
          hero's own picture rather than a second beginning, and the story
          below it returns to a single column at the same width as every other
          chapter.

          3:2 here and 4:3 on mobile: the landscape crop keeps the fold intact
          on a phone, where a 3:2 at full width already costs ~250px. The
          container matches the chapter eyebrow rule below it (max-w-3xl), so
          the image's edges line up with the rule that opens chapter 01. */}
      <section className="bg-background pb-9 md:pb-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <figure data-testid="about-lede-figure" className="m-0 -mx-4 md:mx-0">
            <div
              data-testid="about-lede-image-box"
              className="relative w-full aspect-[4/3] md:aspect-[3/2] max-h-[460px] overflow-hidden rounded-none md:rounded-xl bg-background-alt"
            >
              {imgFailed ? null : (
                <Image
                  src={optimizeCloudinary(STORY_IMAGE, {
                    aspectRatio: "3:2",
                    width: STORY_IMAGE_WIDTH,
                  })}
                  alt={tAbout("img.story_alt")}
                  fill
                  // 672, not 768: the container is max-w-3xl (768) minus
                  // md:px-12 on both sides (96), so 768 fetches a ~14% wider
                  // source than any pixel that gets painted. Measured, not
                  // derived — getBoundingClientRect on this box reports
                  // w=672.0 at 1440.
                  sizes="(min-width: 768px) 672px, 100vw"
                  className="object-cover"
                  // priority, and the side-bleed image it replaces was
                  // correctly NOT priority. Moving the photograph up to the
                  // lede moved it above the fold, which makes it the LCP
                  // candidate, and lazy-loading the LCP element delays the
                  // paint it defines. Measured in the self-QA run rather than
                  // eyeballed: the lede's top edge is 319.5px at 375x812 and
                  // 382.7px at 1440x900 — inside the initial viewport at both.
                  priority
                  onError={() => setImgFailed(true)}
                />
              )}
            </div>
            <figcaption className="mt-3 px-4 md:px-0 font-body-md text-[13px] text-fg-muted leading-snug">
              {tAbout("img.story_caption")}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ======== Chapter 01 — Sapir's story (single column) ========
          MEH-1130 removed the framed portrait standfirst that stood here since
          MEH-100; MEH-2211 removes the side bleed that replaced it. The
          photograph is now the lede above, so this section is prose only and
          returns to `max-w-3xl` — the same column as every other chapter, and
          the same width the business line below it uses.

          `overflow-x-clip` went with the bleed: nothing here breaks out of the
          container any more, so there is no 50vw overshoot left to clip. */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Chapter num="01" label={tAbout("chapter.1.label")} />
          <div className="font-body-md text-[17px] text-text/90 leading-[1.75] space-y-5">
            {/* Chapter 01's h2. It carries `about-story-h2` so the chapter-02
                heading below can be asserted to share these exact classes —
                the two chapter headings must read as one rank, and a class
                string is the only thing that guarantees it. */}
            <h2
              data-testid="about-story-h2"
              className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight !mb-6"
            >
              {t("story.greeting")}
            </h2>
            <p className="text-fg-muted">{t("story.p1")}</p>
            <p>{t("story.p2")}</p>
            <p>{t("story.p3")}</p>
            <p>{t("story.p4")}</p>
            <p>{t("story.p5")}</p>
            {/* SIGNATURE — the personal anchor that replaces the face.
                Accent-gold rule on the inline-start edge, square corners.

                story.caption3 is kept VERBATIM from the figcaption that was
                removed with the portrait: it is editorial copy, not a photo
                credit, so it survives the card it happened to live inside.
                story.caption1 does NOT survive — its opening clause IS
                signature.role ("מייסדת מהמקור"), and the two would have read
                twice, three lines apart. Both keys remain in he.json and
                en.json untouched, so restoring either is a one-line change
                if Sapir wants it back. */}
            <div data-testid="about-signature" className="!mt-9 border-s-2 border-accent ps-4 rounded-none">
              <p className="font-headline-display font-black text-primary text-[26px] md:text-[28px] leading-tight">
                {tAbout("signature.name")}
              </p>
              <p className="mt-1 font-body-md text-sm text-fg-muted leading-snug">
                {tAbout("signature.role")}
              </p>
              <p className="mt-2.5 font-body-md text-[15px] text-text font-medium leading-snug max-w-[46ch]">
                {t("story.caption3")}
              </p>
            </div>
          </div>
          <ExitLink href="/producers" testId="about-exit-story">
            {tAbout("exit.story")}
          </ExitLink>

          {/* Business line — the early owner-facing exit. Until now the only
              one was a demoted link inside Close, at the very bottom.

              MEH-2211, two changes in one block. It was a full-width
              `bg-background-alt` band, and of the five visual languages
              Sapir's 29/08 review found stacked in this seam that band was the
              loudest: a tonal full-bleed surface reads as a section of its
              own, so a one-line aside announced itself as a chapter. It is now
              an inline block separated by a hairline rule instead of a tone
              change — the lead muted, only the link primary, so the seam
              carries one accent rather than a slab. `border-border` is the
              hairline the comparison spine already uses; no new token.

              And it now lives INSIDE chapter 01's section rather than in one
              of its own. That is what makes the B4 spacing fall out of
              existing tokens instead of new ones: `mt-10` puts it ~40px below
              the exit link (inside a chapter), while the gap to chapter 02 is
              this section's `md:pb-14` plus chapter 02's `md:py-14` — the
              largest gap in the seam, which is exactly where the chapter
              break should read. DOM order is unchanged; only the wrapper is. */}
          <div className="mt-10 border-t border-border pt-6">
            <p
              id="about-biz-lead"
              className="font-body-md text-[15px] text-fg-muted leading-snug"
            >
              {tAbout("biz_strip_lead")}
            </p>
            {/* aria-labelledby, and it is load-bearing rather than belt-and-braces.
                The copy used to be ONE string inside the anchor, so the link's
                accessible name was «בעלת עסק? כך זה עובד אצלנו» — self-describing.
                Splitting the lead out into a sibling <p> for the visual design
                silently cut that name down to «כך זה עובד אצלנו», which in a
                screen reader's link list reads "here's how it works" with nothing
                saying who it is for. WCAG 2.4.4 (Link Purpose in Context, level A)
                counts context from the SAME sentence, paragraph, list item or
                cell — a preceding sibling paragraph is not on that list, and
                IS 5568 applies to this page.

                Pointing at both ids rebuilds the exact pre-split name from the
                two elements that render it, so the visual design change costs
                the screen-reader user nothing. Measured on the running page:
                getByRole("link", {name: "בעלת עסק? כך זה עובד אצלנו"}) returned 0
                before this and 1 after, with a control query passing in both. */}
            <LocaleLink
              href="/about/for-businesses"
              data-testid="about-biz-strip"
              aria-labelledby="about-biz-lead about-biz-cta"
              className="mt-1.5 inline-flex items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span id="about-biz-cta">{tAbout("biz_strip")}</span>
              <ArrowLeft size={15} aria-hidden="true" />
            </LocaleLink>
          </div>
        </div>
      </FadeInSection>

      {/* ======== Chapter 02 — the difference (3-stop gold-dot path) · MEH-841 ========
          MEH-2211 folds the pull-quote into this chapter instead of leaving it
          as a section of its own. Once the choose block and the bread band came
          out, the quote was left hanging between two chapters belonging to
          neither, and Sapir's 29/08 call is that it becomes chapter 02's
          headline: the sentence the chapter is about, promoted rather than
          moved. This is the MEH-1130 AC3 chaptering decision, not a reorder —
          the CONTENT order is untouched, the quote still precedes
          «מה שמשתנה בדרך», and only the eyebrow rises by one element.

          Two consequences worth stating because they are easy to get wrong:

          1. The quote is an <h2> now, so it drops `border-s-2 border-accent
             ps-6` — a heading does not also carry a blockquote's side rule, and
             the chapter's own hairline rule already sits directly above it. Its
             classes are IDENTICAL to chapter 01's h2 (`about-story-h2`), which
             is what makes the two chapters read as one rank; the QA harness
             asserts the two class strings are equal rather than eyeballing it.
          2. «מה שמשתנה בדרך» was this section's <h2>. It is now a LEAD
             PARAGRAPH — one h2 per chapter, and two headings in a row would
             have made the quote look like a kicker over the real title. The
             string is unchanged on both locales. */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Chapter num="02" label={tAbout("chapter.2.label")} />
          <h2 className="font-headline-lg font-bold text-text text-[clamp(23px,4vw,30px)] leading-tight !mb-6">
            {t("parallax.quote")}
          </h2>
          <p className="font-body-md text-[17px] font-semibold text-text leading-snug mb-8 md:mb-10">
            {tCompare("heading")}
          </p>
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
          <ExitLink href="/about/process" testId="about-exit-comparison">
            {tAbout("exit.comparison")}
          </ExitLink>
        </div>
      </FadeInSection>

      {/* ======== 03 — Benefits (alt-tone block w/ Values · centered gold numerals) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <Chapter num="03" label={tAbout("chapter.3.label")} as="h2" />
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
          <ExitLink href="/map" testId="about-exit-benefits">
            {tAbout("exit.benefits")}
          </ExitLink>
        </div>
      </FadeInSection>

      {/* ======== MEH-1130 — image band 2 (offset duo) ========
          Rear image larger, front image smaller and overlapping toward the end
          edge with a cream border that reads as a print mount against the
          background-alt tone this section shares with Benefits and Values.

          The overlap is a NEGATIVE MARGIN, not absolute positioning: the front
          block stays in flow, so it contributes its own height, nothing is
          removed from the layout, and there is no z-index to get wrong — DOM
          order alone paints it on top. Static by construction, which is what
          the card asked for (no parallax, no sticky). */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <figure data-testid="about-band-duo" className="m-0">
            <div className="relative w-[86%] md:w-[68%] aspect-[4/3] rounded-md overflow-hidden bg-background">
              <Image
                src={optimizeCloudinary(DUO_REAR, {
                  aspectRatio: "4:3",
                  width: DUO_REAR_WIDTH,
                })}
                alt={tAbout("img.duo_rear_alt")}
                fill
                sizes="(min-width: 1024px) 630px, 86vw"
                className="object-cover"
                priority={false}
              />
            </div>
            <div className="relative w-[46%] md:w-[34%] aspect-[3/4] -mt-[14%] ms-auto me-0 rounded-md overflow-hidden border-[5px] border-background bg-background">
              <Image
                src={optimizeCloudinary(DUO_FRONT, {
                  aspectRatio: "3:4",
                  width: DUO_FRONT_WIDTH,
                })}
                alt=""
                fill
                sizes="(min-width: 1024px) 315px, 46vw"
                className="object-cover"
                priority={false}
              />
            </div>
            <figcaption className="mt-4 font-body-md text-[13px] text-fg-muted leading-snug">
              {tAbout("img.duo_caption")}
            </figcaption>
          </figure>
        </div>
      </FadeInSection>

      {/* ======== 04 — Values (bordered editorial container · gold numerals) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Chapter num="04" label={tAbout("chapter.4.label")} />
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
          <Chapter num="05" label={tAbout("chapter.5.label")} />
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
