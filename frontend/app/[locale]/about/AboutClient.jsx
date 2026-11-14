/* eslint-disable max-lines, max-lines-per-function */
"use client";

/**
 * AboutClient — consumer /about page.
 * S8 Direction D "Feature Standfirst": editorial cream longread —
 * hero · founder story (portrait standfirst) · cream pull-quote ·
 * 3-pillar benefits (gold numerals) · testimonials
 * invitation band · values (bordered box) · CTA · contact signpost (→ /contact).
 * Visual restyle only — every string resolves from about.consumer.* keys.
 * History: MEH-100 (founder portrait); MEH-135 (S8 Direction D port).
 */

import { Link } from "@/i18n/navigation";
// MEH-1840: locale-aware Link. next/link is NOT — with localePrefix "as-needed"
// (i18n/routing.js) a plain <Link href="/about/process"> renders that href
// verbatim, so an /en reader clicking it lands on the HEBREW page. Measured on
// /en/about (02/08): href="/about/process", click → /about/process, while
// /en/about/process exists and returns 200. Every OTHER /about/* link in this
// file has the same defect (6 of them, all pre-existing) — NOT fixed here,
// that is its own change; this import exists so MEH-1840 does not add a 7th.
import { Link as LocaleLink } from "@/i18n/navigation";
import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, Check, Minus } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { optimizeCloudinary } from "@/lib/cloudinary";
// MEH-788: gentle scroll-reveal on the content sections (hero excluded — LCP).
import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";
import { COLOR_CLASSES, VerifiedChip } from "@/components/BadgeRow";
import SectionHeading from "@/components/ui/SectionHeading";

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

// MEH-2439: the decorative 01–04 numerals were removed — they numbered
// nothing a reader acts on, and "01/02/03" on every block is the generic
// template tell this pass set out to remove.
const BENEFITS = [{ key: "local" }, { key: "trust" }, { key: "community" }];
const VALUES = [{ key: "transparency" }, { key: "proximity" }, { key: "quality" }, { key: "safety" }];
// MEH-841: the three comparison rows (two-column table since 05/11). Order is
// the locked editorial order — do not re-sort.
const COMPARE_STOPS = ["row1", "row2", "row3"];

// MEH-1130: the chapter mark that replaces the plain eyebrow on the
// five narrative sections — "<label>" in gold, then a hairline gold rule
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
// MEH-2439 dropped the "0N · " numeral prefix (it was aria-hidden, so the
// accessible name was already the label alone). Where this renders as the
// section's own heading (Benefits, as="h2") that name is the label.
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
function Chapter({ label, as: Tag = "p" }) {
  return (
    <div className="flex items-center gap-3 mb-3 md:mb-4">
      <Tag className="block font-body-md text-sm font-semibold text-gold-deep shrink-0">
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
// re-rendered on every keystroke in the contact form that stood here until
// MEH-2832 (it held form and imgFailed state). Each of
// those re-renders would unmount and remount all three links, throwing away the
// IntersectionObserver registrations next/link uses to prefetch. Caught by the
// CI adversarial reviewer on #3123.
function ExitLink({ href, testId, children, spacing = "mt-8" }) {
  return (
    <LocaleLink
      href={href}
      data-testid={testId}
      className={`${spacing} inline-flex items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {children}
      <ArrowLeft size={16} aria-hidden="true" />
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
  // MEH-2827: the trust group's chapter mark and the real badge labels.
  const tBadges = useTranslations("about_badges");
  const tBadgeCopy = useTranslations("badges");
  const tTier = useTranslations("producer.badge");
  const tTrust = useTranslations("trust");
  // MEH-2832: the label of the one contact link (the footer's «צרו קשר»).
  const tNav = useTranslations("nav.footer");
  const [imgFailed, setImgFailed] = useState(false);

  // text-only section marker label, start-aligned (RTL-safe). No rule — tonal
  // blocks (bg-background-alt) do the separation now. fg-muted keeps AA on BOTH
  // cream and background-alt (accent gold fails 4.5:1 at this size). Label is a
  // <p> by default so it never outranks the section h2; pass as="h2" where the
  // label IS the section heading (Benefits).

  return (
    <div className="relative bg-background">
      {/* ======== 01 — Hero (cream editorial · anchored) ======== */}
      <section className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <h1 className="font-headline-display font-black text-text tracking-tight leading-[1.05] text-[clamp(28px,5vw,52px)] max-w-[15ch]">
            {t("hero.heading")}
          </h1>
          <p className="mt-4 font-body-md text-lg md:text-lg text-text/90 leading-relaxed max-w-[46ch]">
            {t("hero.subheading")}
          </p>
          {/* MEH-2634: the page opened with no way out of it. Every other
              /about surface ends in a CTA; the hero itself sent a reader who
              was already convinced back to the nav. Points at /map, the same
              destination as the why-local CTA below. */}
          <Link
            href="/map"
            data-testid="about-hero-cta"
            className="mt-6 inline-flex items-center gap-2 min-h-[48px] px-6 py-3 bg-primary text-white rounded-full font-body-md font-semibold text-base hover:bg-primary-dark transition-colors focus-ring"
          >
            {t("hero.cta_map")}
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          {/* MEH-2192: dateline. Small muted line, start-aligned like the rest
              of the hero — an E-E-A-T freshness signal a reader can check. */}
          <p
            data-testid="about-updated-at"
            className="mt-4 font-body-md text-sm text-fg-muted"
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
            <figcaption className="mt-3 px-4 md:px-0 font-body-md text-sm text-fg-muted leading-snug">
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
          <Chapter label={tAbout("chapter.1.label")} />
          <div className="font-body-md text-lg text-text/90 leading-[1.75] space-y-5">
            {/* Chapter 01's h2. It carries `about-story-h2` so the chapter-02
                heading below can be asserted to share these exact classes —
                the two chapter headings must read as one rank, and a class
                string is the only thing that guarantees it. */}
            <SectionHeading
              data-testid="about-story-h2"
              className="leading-tight !mb-6"
            >
              {t("story.greeting")}
            </SectionHeading>
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
            {/* MEH-2827 (FinalAbout, Sapir 08/11): quote first, then who said
                it — a gold quote mark, the sentence at headline weight, and a
                quiet attribution row. The side rule is gone. Same strings. */}
            <div data-testid="about-signature" className="!mt-10 relative">
              <span aria-hidden="true" className="block font-headline-display font-black text-accent text-6xl leading-none h-8 -mb-1">
                ”
              </span>
              <p className="font-headline-md font-bold text-text text-[clamp(20px,5.5vw,24px)] leading-snug max-w-[24ch]">
                {t("story.caption3")}
              </p>
              <p className="mt-4 flex items-center gap-2 font-body-md text-sm">
                <span aria-hidden="true" className="h-px w-6 bg-accent" />
                <span className="font-semibold text-primary">{tAbout("signature.name")}</span>
                <span className="text-fg-muted">· {tAbout("signature.role")}</span>
              </p>
            </div>
          </div>
          <ExitLink href="/producers" testId="about-exit-story" spacing="mt-6">
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
          {/* MEH-2827: lead + link on ONE row (flex-wrap: it still wraps on a
              narrow phone rather than overflowing). */}
          <div className="mt-8 border-t border-border pt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p
              id="about-biz-lead"
              className="font-body-md text-base text-fg-muted leading-snug"
            >
              {tAbout("biz_strip_lead")}
            </p>
            {/* aria-labelledby, and it is load-bearing rather than belt-and-braces.
                The copy used to be ONE string inside the anchor, so the link's
                accessible name was «בעלת עסק? כך זה עובד אצלנו» — self-describing
                (MEH-2507 renamed the CTA «שאלות נפוצות על הצטרפות»: the old one
                read like the checking process, which is the /about/process link).
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
              className="inline-flex items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span id="about-biz-cta">{tAbout("biz_strip")}</span>
              <ArrowLeft size={16} aria-hidden="true" />
            </LocaleLink>
          </div>
        </div>
      </FadeInSection>

      {/* ======== Chapter 02 — the difference (two-column table) · MEH-841 ========
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
          2. «מה שמשתנה בדרך» was this section's <h2>, then a lead paragraph;
             it was removed on 05/11 with the spine — the table's column heads
             say what is compared. */}
      <FadeInSection as="section" data-testid="about-comparison" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Chapter label={tAbout("chapter.2.label")} />
          <SectionHeading className="leading-tight !mb-6">
            {t("parallax.quote")}
          </SectionHeading>
          {/* 05/11 (Sapir, option A): a two-column table replaced the gold-dot
              spine. The spine read as a timeline (step 1 → 2 → 3) while the
              content is an unordered comparison, and the «בסופר —» prefix on
              every row hid the other side of it. Column heads now carry the
              two sides; «מה שמשתנה בדרך» was dropped with the spine. The
              /about/process exit link that sat here was dropped too: the
              verification section and the closing band already link there. */}
          {/* MEH-2827 (FinalAbout): the Mehamakor column is a lifted card
              column — surface-card fill, side borders, rounded ends, the seed
              mark on its head, a ✓ on each of its cells and a − on each
              supermarket cell. Gold header rule instead of the black one;
              58/42 widths. border-separate so the column's own borders and
              rounded corners render (collapse would merge them away). The
              icons are aria-hidden: the copy carries the meaning, and the
              <table>/<th>/<td> semantics are unchanged. */}
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: "58%" }} />
              <col style={{ width: "42%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="pb-2.5 pt-3 ps-3 text-start align-bottom font-body-md text-sm md:text-sm font-semibold text-primary-dark bg-surface-card border-x border-t border-border border-b border-b-accent/35 rounded-t-xl">
                  <span className="inline-flex items-center gap-1.5">
                    <Image src="/logo.svg" alt="" aria-hidden="true" width={18} height={18} unoptimized />
                    {tCompare("col_brand")}
                  </span>
                </th>
                <th scope="col" className="pb-2.5 ps-3 text-start align-bottom font-body-md text-sm md:text-sm font-semibold text-fg-muted border-b border-b-accent/35">
                  {tCompare("col_super")}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_STOPS.map((row, i) => (
                <tr key={row}>
                  <th
                    scope="row"
                    className={`py-4 md:py-5 ps-3 pe-4 md:pe-8 text-start align-top font-headline-md font-bold text-primary-dark text-lg md:text-xl leading-snug bg-surface-card border-x border-b border-border ${i === COMPARE_STOPS.length - 1 ? "rounded-b-xl" : ""}`}
                  >
                    <span className="flex gap-2">
                      <Check size={18} weight="bold" aria-hidden="true" className="mt-1 shrink-0 text-primary" />
                      <span>{tCompare(`${row}_brand`)}</span>
                    </span>
                  </th>
                  <td className="py-4 md:py-5 ps-3 align-top font-body-md text-fg-muted text-base md:text-lg leading-relaxed border-b border-border">
                    <span className="flex gap-2">
                      <Minus size={16} aria-hidden="true" className="mt-1.5 shrink-0 text-fg-muted/70" />
                      <span>{tCompare(`${row}_super`)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeInSection>

      {/* ======== 03 — Benefits (alt-tone block w/ Values · centered gold numerals) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 md:px-12">
          <Chapter label={tAbout("chapter.3.label")} as="h2" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
            {BENEFITS.map(({ key }) => (
              <div key={key} className="text-center">
                <h3 className="font-headline-md font-bold text-text text-2xl leading-tight mb-2.5">
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
            <figcaption className="mt-4 font-body-md text-sm text-fg-muted leading-snug">
              {tAbout("img.duo_caption")}
            </figcaption>
          </figure>
        </div>
      </FadeInSection>

      {/* ======== 04 — Values (bordered editorial container · gold numerals) ======== */}
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background-alt py-9 md:py-14 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Chapter label={tAbout("chapter.4.label")} />
          <div className="border-2 border-accent/30 rounded-lg p-8 md:p-14">
            <SectionHeading className="leading-tight">
              {t("values.heading")}
            </SectionHeading>
            <p className="font-body-md text-fg-muted text-lg leading-relaxed mt-4 max-w-[54ch]">
              {t("values.intro")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-7 md:gap-x-14 md:gap-y-9 mt-8">
              {VALUES.map(({ key }) => (
                <article key={key}>
                  <h3 className="font-headline-md font-bold text-text text-xl">
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

      {/* ======== Trust group — "מה אומרים התגים" (MEH-2827, FinalAbout 08/11) ========
          The three badge explanations used to be three full sections (heading +
          one long paragraph each, with a chapter-sized gap between them and no
          badge in sight). They are now ONE section: the Chapter mark, then three
          cards in the /about/badges item idiom, each with the REAL badge face
          beside its heading — the verified seal (BadgeRow's VerifiedChip, no
          popover), the editor's-pick pill (COLOR_CLASSES.accent) and the
          community TrustBadge.

          The anchors #verification (MEH-1336/1840 deep-links), #editors-pick
          (the recommended-badge popover, BadgeRow) and #community-leader
          (MEH-2527) move onto the cards and keep resolving; scroll-mt-24 keeps
          the sticky header off them. SHOW_VERIFICATION still gates its card.
          Body copy is the same words split into keys (AboutTrustCards.test.jsx
          joins them back and compares to the old strings). */}
      <FadeInSection as="section" data-testid="about-trust" {...REVEAL_PRESET} className="bg-background py-9 md:py-14">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <Chapter label={tBadges("h1")} as="h2" />
          <div className="grid gap-3">
            {SHOW_VERIFICATION && (
              <article id="verification" className="scroll-mt-24 rounded-lg border border-border bg-surface-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
                  <h3 className="font-headline-md font-bold text-text text-xl leading-tight">{t("verification.heading")}</h3>
                  <VerifiedChip label={tTier("verified_label")} />
                </div>
                <p className="font-body-md text-fg-muted text-base leading-relaxed">{t("verification.body_1")}</p>
                <p className="mt-2.5 font-body-md text-fg-muted text-base leading-relaxed">{t("verification.body_2")}</p>
                {/* MEH-1840: teaser to the full acceptance process — same key and
                    target as before, now inside the card. */}
                <LocaleLink
                  href="/about/process"
                  data-testid="verification-process-link"
                  className="mt-3 inline-flex min-h-touch items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {tProcess("crosslink_from_about")}
                  <ArrowLeft size={16} aria-hidden="true" />
                </LocaleLink>
              </article>
            )}
            <article id="editors-pick" className="scroll-mt-24 rounded-lg border border-border bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
                <h3 className="font-headline-md font-bold text-text text-xl leading-tight">{t("editors_pick.heading")}</h3>
                <span
                  data-testid="editors-pick-chip"
                  className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium ${COLOR_CLASSES.accent}`}
                >
                  {tBadgeCopy("recommended.label")}
                </span>
              </div>
              <p className="font-body-md text-fg-muted text-base leading-relaxed">{t("editors_pick.body_1")}</p>
              <p className="mt-2.5 font-body-md text-fg-muted text-base leading-relaxed">{t("editors_pick.list_lead")}</p>
              <ul className="mt-2 grid gap-2">
                {["item_1", "item_2"].map((item) => (
                  <li key={item} className="flex gap-2.5 font-body-md text-fg-muted text-base leading-relaxed">
                    <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{t(`editors_pick.${item}`)}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article id="community-leader" className="scroll-mt-24 rounded-lg border border-border bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
                <h3 className="font-headline-md font-bold text-text text-xl leading-tight">{t("community_leader.heading")}</h3>
                {/* The TrustBadge tier-4 face without its tooltip wrapper: that
                    wrapper puts aria-label on a role-less span (axe
                    aria-prohibited-attr), and the card already explains the
                    badge. AboutTrustCards.test.jsx renders the real TrustBadge
                    and asserts these classes match it, so they cannot drift. */}
                <span data-testid="community-chip" className="inline-flex items-center rounded-full border font-medium text-xs px-2 py-0.5 bg-warning-50 text-warning-700 border-warning-200">
                  {tTrust("tier_4.label")}
                </span>
              </div>
              <p className="font-body-md text-fg-muted text-base leading-relaxed">{t("community_leader.body_1")}</p>
              <p className="mt-2.5 font-body-md text-fg-muted text-base leading-relaxed">{t("community_leader.body_2")}</p>
            </article>
          </div>
          <LocaleLink
            href="/about/badges"
            data-testid="about-badges-link"
            className="mt-5 inline-flex min-h-touch items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("badges_link.label")}
            <ArrowLeft size={16} aria-hidden="true" />
          </LocaleLink>
        </div>
      </FadeInSection>

      {/* ======== 06 — Testimonials (slim invitation band) — MEH-1112 render-gated ======== */}
      {SHOW_TESTIMONIALS && (
        <FadeInSection as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
          <div className="max-w-3xl mx-auto px-4 md:px-12 text-center">
            <div className="border-y border-border py-12 md:py-14">
              <SectionHeading className="leading-tight max-w-[18ch] mx-auto">
                {t("testimonials.heading")}
              </SectionHeading>
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
      <FadeInSection as="section" {...REVEAL_PRESET} className="bg-primary text-background py-12 md:py-20 scroll-mt-24">
        {/* MEH-2439: the close sits on the full brand green (was the off-palette
            mint green-50) with the button inverted to cream, so the page ends on
            the same colour the home featured block and footer use. */}
        <div className="max-w-2xl mx-auto px-4 text-center">
          {/* single primary CTA — consumer */}
          <Link
            href="/map"
            className="inline-flex items-center gap-2 min-h-[56px] px-9 py-4 bg-background text-primary rounded-lg font-semibold text-lg hover:bg-background-alt transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            {t("cta.explore")}
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          {/* business pitch line — lead-in for the demoted actions below (cta.heading verbatim). MEH-2439: set in the headline face on the green so the band reads as an ending, still after the one primary button. */}
          <p className="mt-7 font-headline-md font-bold text-xl text-background max-w-[44ch] mx-auto leading-relaxed">
            {t("cta.heading")}
          </p>
          {/* MEH-1112: two secondary actions (business hub + MEH-534 acceptance-process
              cross-link) demoted to one quiet muted row — small, underlined, non-bold —
              so only "גלו בתי עסק קרובים" reads as the primary CTA (per MEH-1049/MEH-907). */}
          {/* 05/11: the three links don't fit one line at 375, and a wrap left a
              «·» alone on the second line. Below md they stack as a column and
              the dots are hidden; md+ keeps the one dotted row. */}
          <div className="mt-3 flex flex-col md:flex-row md:flex-wrap items-center justify-center gap-x-4 gap-y-2 font-body-md text-sm text-background/90">
            <Link
              href="/about/for-businesses"
              className="underline underline-offset-4 hover:text-background rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
            >
              {t("cta.register")}
            </Link>
            <span aria-hidden="true" className="hidden md:inline text-gold-on-dark">·</span>
            <Link
              href="/about/process"
              data-testid="about-close-process-link"
              className="underline underline-offset-4 hover:text-background rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
            >
              {tProcess("crosslink_from_about")}
            </Link>
            {/* MEH-1289: reader-facing "why local" editorial cross-link. */}
            <span aria-hidden="true" className="hidden md:inline text-gold-on-dark">·</span>
            <Link
              href="/about/why-local"
              data-testid="about-close-why-local-link"
              className="underline underline-offset-4 hover:text-background rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
            >
              {t("cta.why_local_link")}
            </Link>
          </div>
        </div>
      </FadeInSection>

      {/* ======== 08 — Contact (signpost to /contact, MEH-2832) ======== */}
      {/* MEH-1113: id="contact" — kept as the anchor old /about#contact links
          land on. scroll-mt-24 offsets the sticky header. */}
      <FadeInSection id="contact" data-chat-hide="" as="section" {...REVEAL_PRESET} className="bg-background py-9 md:py-14 scroll-mt-24">
        <div className="max-w-2xl mx-auto px-4 md:px-12">
          <SectionHeading className="leading-tight">
            {t("contact.heading")}
          </SectionHeading>
          <p className="font-body-md text-fg-muted text-lg mt-3 max-w-[48ch] leading-relaxed">
            {t("contact.subtitle")}
          </p>
          {/* MEH-1323: quiet cross-link to /messages ("how contacting businesses
              works") — closes the desktop ORPHAN from the MEH-1311 route audit.
              Mirrors the testimonials-CTA link treatment. */}
          <Link
            href="/messages"
            className="inline-flex items-center gap-2 mt-4 text-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {t("messages_link")}
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>

          {/* MEH-2832: /contact («דברו איתנו») is the site's one contact form —
              the form that stood here (MEH-1113) moved there with its topic
              select. The section stays as a signpost: same heading, subtitle
              and /messages link (MEH-1323), and id="contact" so old
              /about#contact links still land somewhere that leads on. */}
          <div className="mt-6">
            <Link
              href="/contact"
              data-testid="about-contact-link"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 bg-primary text-background rounded-full font-body-md font-semibold hover:bg-primary-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {tNav("contact")}
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </div>
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
