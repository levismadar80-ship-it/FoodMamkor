/* eslint-disable max-lines, max-lines-per-function */
"use client";

/**
 * AboutProcessClient — consumer /about/process page.
 * S11 "תהליך הקבלה" Direction D "Criteria in the Open": editorial cream
 * surface — hero · 4-step personal process · what's-checked-for-everyone ·
 * the badge (what it adds) · public verification matrix · founder closing ·
 * CTA → register. Visual-only port; every string resolves from process.* keys.
 * Touches: nothing (static editorial page — no API, no producer object). The
 *   badge shown here is ILLUSTRATIVE chrome, not a live per-producer badge.
 * Does NOT: render a live badge — see BadgeRow.jsx / lib/badges.js for the
 *   per-producer surface. This page only EXPLAINS the ADR-022 tier model.
 * History: MEH-534 (S11 Direction D port).
 */

import {
  Path,
  PaperPlaneTilt,
  ChatsCircle,
  MapPin,
  Storefront,
  SealCheck,
  User,
  BookOpen,
  ChatCircleText,
  Certificate,
  Leaf,
  Note,
  HandHeart,
  Cursor,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ClosingCtaBand from "@/components/ClosingCtaBand";
import Seed from "@/components/brand/Seed";
import { SEEDS_LIGHT } from "@/lib/brand-seeds";
import SectionHeading from "@/components/ui/SectionHeading";

// MEH-2833: the four steps' seeds — logo order without sand.
const STEP_SEEDS = SEEDS_LIGHT.filter((seed) => seed.name !== "sand");

// Illustrative tooltip date — this page has NO producer object, so the badge
// is editorial chrome (refchip in the S11 design). Reuses the live tier-1
// tooltip key (producer.badge.verified_tooltip_license) with a literal example
// date instead of a runtime {date}.
const EXAMPLE_DATE = "5.6.2026";

const STEPS = [
  { Icon: PaperPlaneTilt },
  { Icon: ChatsCircle },
  { Icon: MapPin },
  { Icon: Storefront },
];
const EVERYONE = [{ Icon: User }, { Icon: BookOpen }, { Icon: ChatCircleText }];
const CATS_A = [
  // MEH-927: "meat_fish" split into "meat" + "fish" (both license-required).
  "meat",
  "fish",
  "dairy",
  "bread",
  "prepared",
  "fermented",
  "drinks",
  "chocolate",
  "honey",
];
// declared-only categories have no מאומת path; declare-line categories show the
// extra "מוצהר: …" sub-line under the doc cell.
const CATS_B = [
  { key: "vegetables", declare: true },
  { key: "fruits", declare: true },
  { key: "oils" },
  { key: "spices" },
  { key: "soaps" },
  { key: "creams" },
  // MEH-927: "herbal" (תכשירי צמחים) category merged into צמחי מרפא ותוספים;
  // its license-matrix row removed in lockstep.
  { key: "candles", declaredOnly: true },
];

export default function AboutProcessClient() {
  const t = useTranslations("process");
  const tBadge = useTranslations("producer.badge");

  // section marker: hairline gold rule + eyebrow (MEH-2439 dropped the numeral)
  const Marker = ({ children }) => (
    <div className="flex items-center gap-3.5 mb-6">
      <span className="h-px w-10 bg-accent/70" aria-hidden />
      <span className="font-body-md font-medium text-2xs text-fg-muted">
        {children}
      </span>
    </div>
  );

  // FRL-900 gold-geresh: tier label sits on a cream↔gold seam after its icon —
  // ms-[0.14em] nudges the accent word off the seam (margin-inline-start, RTL-safe).
  // MEH-2069: this tag renders inside the bg-background-alt section (#ede4d2,
  // NOT the cream #f5f0e8 page default) — bg-accent/10 there computed 3.68:1,
  // AA fail for 12.5px text (worse than the 4.07:1 cream case). Same
  // usage-level fix already applied twice (MEH-2025/#2825, MEH-2032/#2909):
  // solid bg-surface-card gets text-accent to 5.19:1, independent of the page
  // background since the chip is now fully opaque.
  const VerifiedTag = () => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-surface-card text-accent border border-accent/30 whitespace-nowrap">
      <SealCheck size={13} aria-hidden />
      <span className="ms-[0.14em]">{t("tier.verified")}</span>
    </span>
  );
  const OptVerifiedTag = () => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-transparent text-fg-muted border border-dashed border-border whitespace-nowrap">
      <SealCheck size={13} aria-hidden />
      <span className="ms-[0.14em]">{t("tier.verified")}</span>
    </span>
  );
  const DeclaredTag = () => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-green-50 text-primary-dark border border-primary/20 whitespace-nowrap">
      <Note size={13} aria-hidden />
      <span className="ms-[0.14em]">{t("tier.declared")}</span>
    </span>
  );

  return (
    <div className="relative bg-background">
      {/* ======== 01 — Hero ======== */}
      <section data-testid="process-hero" className="bg-background py-12 md:py-20 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <span className="inline-flex items-center gap-2 font-body-md font-semibold text-xs text-accent mb-4">
            <Path size={15} aria-hidden />
            {t("hero.eyebrow")}
          </span>
          <h1 className="font-headline-display font-black text-text tracking-tight leading-[1.02] text-[clamp(32px,8vw,56px)] max-w-[15ch]">
            {t.rich("hero.h1", {
              em: (chunks) => (
                <em className="font-english italic font-semibold text-accent ms-[0.14em]">{chunks}</em>
              ),
            })}
          </h1>
          <p className="mt-5 font-body-md text-lg md:text-xl text-text/90 leading-relaxed max-w-[44ch]">
            {t("hero.sub")}
          </p>
        </div>
      </section>

      {/* ======== 02 — The 4-step personal process ======== */}
      <section className="bg-background py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker>{t("steps.marker")}</Marker>
          <p data-testid="process-steps-lead" className="font-english italic text-xl text-fg-muted mb-8 max-w-[48ch]">
            {t("steps.lead")}
          </p>
          <ol data-testid="process-steps" className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {STEPS.map(({ Icon }, i) => (
              // content-start (MEH-2833): the 4-up row stretches every <li> to the
              // tallest step; without it the stretch pads the seed row, and the
              // step titles land at different heights.
              <li
                key={i}
                className="grid grid-cols-[44px_1fr] md:grid-cols-1 gap-4 items-start content-start"
              >
                {/* MEH-2833 (seed layer, board 3): each step is a seed in logo
                    order — green, terracotta, gold, sage (sand would vanish on
                    cream) — with its number on it: cream on the three dark
                    seeds, text-ink on gold. 40px wide → 60 tall (Seed keeps the
                    logo seed's 2:3; the card's «40×56» is the board's rounding),
                    and the box is the seed's own size. No inner highlight: the
                    number sits where the highlight would be, and on it cream
                    drops below 3:1. 20px bold = WCAG large text, so cream passes
                    at 3.3–3.5:1 on terracotta/sage. The seed is aria-hidden; the
                    number is real text. Phone: centred in its 44px column; md+:
                    start-aligned with the step's text, as the circle was. */}
                <span
                  data-testid="process-step-seed"
                  data-seed={STEP_SEEDS[i].name}
                  dir="ltr"
                  className="relative grid place-items-center w-10 h-[60px] justify-self-center md:justify-self-start"
                >
                  <Seed color={STEP_SEEDS[i].fill} size={40} className="absolute inset-0" />
                  <span
                    className={`relative numeric font-english font-bold text-xl pt-1 ${STEP_SEEDS[i].name === "gold" ? "text-text" : "text-background"}`}
                  >
                    {i + 1}
                  </span>
                </span>
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <Icon size={19} className="text-primary shrink-0" aria-hidden />
                    <h3 className="font-headline-md font-bold text-xl leading-tight text-text">
                      {t(`steps.s${i + 1}_title`)}
                    </h3>
                  </div>
                  <p className="font-body-md text-base leading-relaxed text-fg-muted max-w-[50ch]">
                    {t(`steps.s${i + 1}_body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {/* badge aside — the optional מאומת step is explicitly separate from step 4 */}
          <div data-testid="process-badge-aside" className="mt-8 grid grid-cols-[auto_1fr] gap-3 items-start rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
            <SealCheck size={20} className="text-accent mt-0.5 shrink-0" aria-hidden />
            <div>
              <div className="font-body-md font-semibold text-sm text-text mb-1">
                {t("steps.badge_aside_title")}
              </div>
              <p className="font-body-md text-sm leading-relaxed text-fg-muted">
                {t("steps.badge_aside_body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== 03 — What's checked for everyone ======== */}
      <section data-testid="process-everyone" className="bg-background-alt py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker>{t("everyone.marker")}</Marker>
          <SectionHeading className="leading-tight">
            {t("everyone.h2")}
          </SectionHeading>
          <p className="mt-3.5 font-body-md text-lg leading-relaxed text-text/90 max-w-[52ch]">
            {t("everyone.intro")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mt-8">
            {EVERYONE.map(({ Icon }, i) => (
              <div key={i}>
                <h3 className="font-headline-md font-bold text-xl leading-tight text-text mb-2 flex items-center gap-2">
                  <Icon size={18} className="text-primary shrink-0" aria-hidden />
                  {t(`everyone.c${i + 1}_title`)}
                </h3>
                <p className="font-body-md text-base leading-relaxed text-fg-muted">
                  {t(`everyone.c${i + 1}_body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======== 04 — The badge: what it adds ======== */}
      <section data-testid="process-badge" className="bg-background py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker>{t("badge.marker")}</Marker>
          <div className="rounded-3xl border border-border bg-surface/40 p-8 md:p-12 grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-10 md:gap-12 md:items-center">
            <div>
              <p className="font-headline-md font-bold text-text text-[clamp(23px,5vw,28px)] leading-snug max-w-[24ch] tracking-tight">
                {t.rich("badge.oneliner", {
                  em: (chunks) => (
                    <em className="font-english italic font-semibold text-accent ms-[0.14em]">
                      {chunks}
                    </em>
                  ),
                })}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-6">
                <span className="inline-flex items-center gap-2 bg-background border border-accent text-accent rounded-full ps-3.5 pe-4 py-2 font-body-md font-semibold text-sm">
                  <SealCheck size={17} aria-hidden />
                  <span className="ms-[0.14em]">{t("tier.verified")}</span>
                </span>
                <span data-testid="process-badge-tooltip" className="inline-flex items-center gap-2 font-english italic text-base text-fg-muted">
                  <Cursor size={14} aria-hidden />
                  {tBadge.rich("verified_tooltip_license", {
                    date: <span className="numeric not-italic text-accent">{EXAMPLE_DATE}</span>,
                  })}
                </span>
              </div>
            </div>
            {/* affirmative absence — never a negative flag */}
            <div className="border-s-2 border-green-300 ps-5">
              <h3 className="font-headline-md font-bold text-text text-xl leading-tight mb-2.5">
                {t("badge.absence_h3")}
              </h3>
              <p className="font-body-md text-base leading-relaxed text-text max-w-[52ch] mb-3">
                {t("badge.absence_body")}
              </p>
              <p className="font-english italic font-medium text-lg text-primary-dark">
                {t("badge.absence_kicker")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== 05 — Public verification matrix ======== */}
      <section data-testid="process-matrix" className="bg-background-alt py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker>{t("matrix.marker")}</Marker>
          <SectionHeading className="leading-tight">
            {t("matrix.h2")}
          </SectionHeading>
          <p className="mt-3.5 font-body-md text-lg leading-relaxed text-text/90 max-w-[54ch]">
            {t("matrix.intro")}
          </p>

          {/* GROUP A — license required */}
          <div data-testid="process-matrix-a" className="mt-9">
            <div className="mb-4">
              <div className="flex items-center gap-2.5 font-headline-md font-bold text-xl leading-tight text-text mb-1.5">
                <Certificate size={18} className="text-accent shrink-0" aria-hidden />
                {t("matrix.groupA_title")}
              </div>
              <p className="font-body-md text-sm leading-relaxed text-fg-muted max-w-[56ch]">
                {t.rich("matrix.groupA_desc", {
                  b: (chunks) => <b className="font-semibold text-primary-dark">{chunks}</b>,
                })}
              </p>
            </div>
            <div className="border-t border-border">
              {CATS_A.map((key) => (
                <div
                  key={key}
                  data-testid="process-matrix-row"
                  className="grid grid-cols-1 md:grid-cols-[minmax(180px,1.1fr)_minmax(150px,auto)_1.4fr] gap-y-1.5 md:gap-6 py-4 border-b border-border md:items-center"
                >
                  <div className="font-headline-md font-bold text-lg md:text-lg leading-tight text-text">
                    {t(`matrix.catA.${key}`)}
                  </div>
                  <div>
                    <VerifiedTag />
                  </div>
                  <div className="font-body-md text-sm leading-snug text-fg-muted">
                    {key === "honey" ? t("matrix.honey_doc") : t("matrix.groupA_doc")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GROUP B — exempt */}
          <div data-testid="process-matrix-b" className="mt-9">
            <div className="mb-4">
              <div className="flex items-center gap-2.5 font-headline-md font-bold text-xl leading-tight text-text mb-1.5">
                <Leaf size={18} className="text-accent shrink-0" aria-hidden />
                {t("matrix.groupB_title")}
              </div>
              <p className="font-body-md text-sm leading-relaxed text-fg-muted max-w-[56ch]">
                {t.rich("matrix.groupB_desc", {
                  b: (chunks) => <b className="font-semibold text-primary-dark">{chunks}</b>,
                })}
              </p>
            </div>
            <div className="border-t border-border">
              {CATS_B.map(({ key, declare, declaredOnly }) => (
                <div
                  key={key}
                  data-testid="process-matrix-row"
                  className="grid grid-cols-1 md:grid-cols-[minmax(180px,1.1fr)_minmax(150px,auto)_1.4fr] gap-y-1.5 md:gap-6 py-4 border-b border-border md:items-center"
                >
                  <div className="font-headline-md font-bold text-lg md:text-lg leading-tight text-text">
                    {t(`matrix.catB.${key}.label`)}
                  </div>
                  <div className="flex items-center flex-wrap gap-2">
                    <DeclaredTag />
                    {!declaredOnly && (
                      <>
                        <span className="font-english italic text-fg-muted text-sm">
                          {t("matrix.path_or")}
                        </span>
                        <OptVerifiedTag />
                      </>
                    )}
                  </div>
                  <div className="font-body-md text-sm leading-snug text-fg-muted">
                    {declaredOnly ? (
                      t(`matrix.catB.${key}.note`)
                    ) : (
                      <>
                        {t(`matrix.catB.${key}.doc`)}
                        {declare && (
                          <span className="block font-english italic text-sm text-primary-dark mt-0.5 ms-[0.14em]">
                            {t(`matrix.catB.${key}.declare`)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* personal-process caveat */}
          <div className="mt-9 grid grid-cols-[auto_1fr] gap-3 items-start rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <HandHeart size={20} className="text-primary mt-0.5 shrink-0" aria-hidden />
            <p className="font-body-md text-sm leading-relaxed text-text max-w-[62ch]">
              {t("matrix.caveat")}
            </p>
          </div>
        </div>
      </section>

      {/* ======== 06 — Founder closing line ======== */}
      {/* MEH-2439: the quote is upright. Frank Ruhl Libre ships no italic, so
          `italic` was a browser-synthesised slant, and the tracked eyebrow
          spaced Hebrew letters apart. */}
      <section data-testid="process-closing" className="bg-background py-16 md:py-24 scroll-mt-24" aria-label={t("closing.em_mark")}>
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <span className="block font-body-md font-semibold text-sm text-accent mb-5 ps-6 md:ps-8">
            {t("closing.em_mark")}
          </span>
          <blockquote className="border-s-2 border-accent ps-6 md:ps-8 me-auto max-w-[20ch] md:max-w-[22ch] font-headline-display font-bold text-primary-dark text-[clamp(28px,8vw,52px)] leading-[1.15]">
            {t("closing.quote")}
          </blockquote>
          <div className="ps-6 md:ps-8 mt-5 font-body-md text-base text-fg-muted">
            {t("closing.attrib")}
          </div>
        </div>
      </section>

      {/* ======== 07 — CTA → register ======== */}
      {/* MEH-2439: full brand green (was mint green-50), one column, cream button.
          MEH-2824: now the shared ClosingCtaBand — same band as /join and home
          (centred, inverted mark; the ArrowLeft beside the button is gone with
          the old layout). Copy verbatim; `id="join"` + scroll-mt-24
          keep the in-page anchor landing below the sticky header. */}
      <ClosingCtaBand
        id="join"
        data-testid="process-cta"
        className="scroll-mt-24"
        title={t("cta.h2")}
        body={t("cta.intro")}
        ctaHref="/register/producer"
        ctaLabel={t("cta.submit")}
      />

      {/* Subtle film grain — house signature for the cream editorial surfaces
          (mirrors /about). Inline feTurbulence data-URI, pointer-events-none,
          ~3.5%; top film because the tonal section fills are opaque. RTL-neutral. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='processGrain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23processGrain)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  );
}
