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

import Link from "next/link";
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
  ArrowLeft,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

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

  // section marker: hairline gold rule + Cormorant italic numeral + eyebrow
  const Marker = ({ n, children }) => (
    <div className="flex items-center gap-3.5 mb-6">
      <span className="h-px w-10 bg-accent/70" aria-hidden />
      <span aria-hidden className="numeric font-english italic font-semibold text-accent text-[21px]">
        {n}
      </span>
      <span className="font-body-md font-medium text-[11px] text-fg-muted">
        {children}
      </span>
    </div>
  );

  // FRL-900 gold-geresh: tier label sits on a cream↔gold seam after its icon —
  // ms-[0.14em] nudges the accent word off the seam (margin-inline-start, RTL-safe).
  const VerifiedTag = () => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold bg-accent/10 text-accent border border-accent/30 whitespace-nowrap">
      <SealCheck size={13} aria-hidden />
      <span className="ms-[0.14em]">{t("tier.verified")}</span>
    </span>
  );
  const OptVerifiedTag = () => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold bg-transparent text-fg-muted border border-dashed border-border whitespace-nowrap">
      <SealCheck size={13} aria-hidden />
      <span className="ms-[0.14em]">{t("tier.verified")}</span>
    </span>
  );
  const DeclaredTag = () => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold bg-green-50 text-primary-dark border border-primary/20 whitespace-nowrap">
      <Note size={13} aria-hidden />
      <span className="ms-[0.14em]">{t("tier.declared")}</span>
    </span>
  );

  return (
    <div className="relative bg-background">
      {/* ======== 01 — Hero ======== */}
      <section className="bg-background py-12 md:py-20 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <span className="inline-flex items-center gap-2 font-body-md font-semibold text-[12px] text-accent mb-4">
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
          <p className="mt-5 font-body-md text-[17px] md:text-xl text-text/90 leading-relaxed max-w-[44ch]">
            {t("hero.sub")}
          </p>
        </div>
      </section>

      {/* ======== 02 — The 4-step personal process ======== */}
      <section className="bg-background py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker n="01">{t("steps.marker")}</Marker>
          <p className="font-english italic text-[19px] text-fg-muted mb-8 max-w-[48ch]">
            {t("steps.lead")}
          </p>
          <ol className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {STEPS.map(({ Icon }, i) => (
              <li
                key={i}
                className="grid grid-cols-[44px_1fr] md:grid-cols-1 gap-4 items-start"
              >
                <span
                  aria-hidden
                  className="numeric w-11 h-11 rounded-full border border-accent bg-background grid place-items-center font-english italic font-semibold text-[20px] text-accent"
                >
                  {`0${i + 1}`}
                </span>
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <Icon size={19} className="text-primary shrink-0" aria-hidden />
                    <h3 className="font-headline-md font-bold text-[21px] leading-tight text-text">
                      {t(`steps.s${i + 1}_title`)}
                    </h3>
                  </div>
                  <p className="font-body-md text-[15.5px] leading-relaxed text-fg-muted max-w-[50ch]">
                    {t(`steps.s${i + 1}_body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {/* badge aside — the optional מאומת step is explicitly separate from step 4 */}
          <div className="mt-8 grid grid-cols-[auto_1fr] gap-3 items-start rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
            <SealCheck size={20} className="text-accent mt-0.5 shrink-0" aria-hidden />
            <div>
              <div className="font-body-md font-semibold text-[14.5px] text-text mb-1">
                {t("steps.badge_aside_title")}
              </div>
              <p className="font-body-md text-[14px] leading-relaxed text-fg-muted">
                {t("steps.badge_aside_body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== 03 — What's checked for everyone ======== */}
      <section className="bg-background-alt py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker n="02">{t("everyone.marker")}</Marker>
          <h2 className="font-headline-lg font-bold text-text text-[clamp(26px,5.4vw,32px)] leading-tight tracking-tight">
            {t("everyone.h2")}
          </h2>
          <p className="mt-3.5 font-body-md text-[17px] leading-relaxed text-text/90 max-w-[52ch]">
            {t("everyone.intro")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mt-8">
            {EVERYONE.map(({ Icon }, i) => (
              <div key={i}>
                <span
                  aria-hidden
                  className="numeric font-english italic font-semibold text-accent text-3xl md:text-[34px] block mb-2.5"
                >
                  {`0${i + 1}`}
                  <span className="opacity-50">—</span>
                </span>
                <h3 className="font-headline-md font-bold text-[20px] leading-tight text-text mb-2 flex items-center gap-2">
                  <Icon size={18} className="text-primary shrink-0" aria-hidden />
                  {t(`everyone.c${i + 1}_title`)}
                </h3>
                <p className="font-body-md text-[15.5px] leading-relaxed text-fg-muted">
                  {t(`everyone.c${i + 1}_body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======== 04 — The badge: what it adds ======== */}
      <section className="bg-background py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker n="03">{t("badge.marker")}</Marker>
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
                <span className="inline-flex items-center gap-2 bg-background border border-accent text-accent rounded-full ps-3.5 pe-4 py-2 font-body-md font-semibold text-[14.5px]">
                  <SealCheck size={17} aria-hidden />
                  <span className="ms-[0.14em]">{t("tier.verified")}</span>
                </span>
                <span className="inline-flex items-center gap-2 font-english italic text-[15px] text-fg-muted">
                  <Cursor size={14} aria-hidden />
                  {tBadge.rich("verified_tooltip_license", {
                    date: <span className="numeric not-italic text-accent">{EXAMPLE_DATE}</span>,
                  })}
                </span>
              </div>
            </div>
            {/* affirmative absence — never a negative flag */}
            <div className="border-s-2 border-green-300 ps-5">
              <h3 className="font-headline-md font-bold text-text text-[20px] leading-tight mb-2.5">
                {t("badge.absence_h3")}
              </h3>
              <p className="font-body-md text-[15.5px] leading-relaxed text-text max-w-[52ch] mb-3">
                {t("badge.absence_body")}
              </p>
              <p className="font-english italic font-medium text-[18px] text-primary-dark">
                {t("badge.absence_kicker")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== 05 — Public verification matrix ======== */}
      <section className="bg-background-alt py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <Marker n="04">{t("matrix.marker")}</Marker>
          <h2 className="font-headline-lg font-bold text-text text-[clamp(26px,5.4vw,32px)] leading-tight tracking-tight">
            {t("matrix.h2")}
          </h2>
          <p className="mt-3.5 font-body-md text-[17px] leading-relaxed text-text/90 max-w-[54ch]">
            {t("matrix.intro")}
          </p>

          {/* GROUP A — license required */}
          <div className="mt-9">
            <div className="mb-4">
              <div className="flex items-center gap-2.5 font-headline-md font-bold text-[19px] leading-tight text-text mb-1.5">
                <Certificate size={18} className="text-accent shrink-0" aria-hidden />
                {t("matrix.groupA_title")}
              </div>
              <p className="font-body-md text-[14.5px] leading-relaxed text-fg-muted max-w-[56ch]">
                {t.rich("matrix.groupA_desc", {
                  b: (chunks) => <b className="font-semibold text-primary-dark">{chunks}</b>,
                })}
              </p>
            </div>
            <div className="border-t border-border">
              {CATS_A.map((key) => (
                <div
                  key={key}
                  className="grid grid-cols-1 md:grid-cols-[minmax(180px,1.1fr)_minmax(150px,auto)_1.4fr] gap-y-1.5 md:gap-6 py-4 border-b border-border md:items-center"
                >
                  <div className="font-headline-md font-bold text-[17px] md:text-[18px] leading-tight text-text">
                    {t(`matrix.catA.${key}`)}
                  </div>
                  <div>
                    <VerifiedTag />
                  </div>
                  <div className="font-body-md text-[14px] leading-snug text-fg-muted">
                    {key === "honey" ? t("matrix.honey_doc") : t("matrix.groupA_doc")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GROUP B — exempt */}
          <div className="mt-9">
            <div className="mb-4">
              <div className="flex items-center gap-2.5 font-headline-md font-bold text-[19px] leading-tight text-text mb-1.5">
                <Leaf size={18} className="text-accent shrink-0" aria-hidden />
                {t("matrix.groupB_title")}
              </div>
              <p className="font-body-md text-[14.5px] leading-relaxed text-fg-muted max-w-[56ch]">
                {t.rich("matrix.groupB_desc", {
                  b: (chunks) => <b className="font-semibold text-primary-dark">{chunks}</b>,
                })}
              </p>
            </div>
            <div className="border-t border-border">
              {CATS_B.map(({ key, declare, declaredOnly }) => (
                <div
                  key={key}
                  className="grid grid-cols-1 md:grid-cols-[minmax(180px,1.1fr)_minmax(150px,auto)_1.4fr] gap-y-1.5 md:gap-6 py-4 border-b border-border md:items-center"
                >
                  <div className="font-headline-md font-bold text-[17px] md:text-[18px] leading-tight text-text">
                    {t(`matrix.catB.${key}.label`)}
                  </div>
                  <div className="flex items-center flex-wrap gap-2">
                    <DeclaredTag />
                    {!declaredOnly && (
                      <>
                        <span className="font-english italic text-fg-muted text-[14px]">
                          {t("matrix.path_or")}
                        </span>
                        <OptVerifiedTag />
                      </>
                    )}
                  </div>
                  <div className="font-body-md text-[14px] leading-snug text-fg-muted">
                    {declaredOnly ? (
                      t(`matrix.catB.${key}.note`)
                    ) : (
                      <>
                        {t(`matrix.catB.${key}.doc`)}
                        {declare && (
                          <span className="block font-english italic text-[14.5px] text-primary-dark mt-0.5 ms-[0.14em]">
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
            <p className="font-body-md text-[14.5px] leading-relaxed text-text max-w-[62ch]">
              {t("matrix.caveat")}
            </p>
          </div>
        </div>
      </section>

      {/* ======== 06 — Founder closing line ======== */}
      <section className="bg-background py-16 md:py-24 scroll-mt-24" aria-label={t("closing.em_mark")}>
        <div className="max-w-3xl mx-auto px-4 md:px-12">
          <span className="block font-english italic text-[15px] tracking-[0.16em] uppercase text-accent mb-5 ps-6 md:ps-8">
            {t("closing.em_mark")}
          </span>
          <blockquote className="border-s-2 border-accent ps-6 md:ps-8 me-auto max-w-[17ch] md:max-w-[19ch] font-headline-display italic font-medium text-primary-dark text-[clamp(28px,8vw,52px)] leading-tight tracking-tight">
            {t("closing.quote")}
          </blockquote>
          <div className="ps-6 md:ps-8 mt-4 font-body-md text-[11px] tracking-wider uppercase text-fg-muted">
            {t("closing.attrib")}
          </div>
        </div>
      </section>

      {/* ======== 07 — CTA → register ======== */}
      <section id="join" className="bg-green-50 border-y border-border py-12 md:py-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
            <div>
              <h2 className="font-headline-lg font-bold text-text text-[clamp(27px,5.6vw,34px)] leading-tight tracking-tight max-w-[18ch]">
                {t("cta.h2")}
              </h2>
              <p className="mt-3.5 font-body-md text-[16.5px] leading-relaxed text-fg-muted max-w-[46ch]">
                {t("cta.intro")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3.5 md:mt-1.5">
              <Link
                href="/register/producer"
                className="inline-flex items-center gap-2 min-h-[52px] px-7 py-3.5 bg-primary text-white rounded-2xl font-body-md font-semibold text-base hover:bg-primary-dark transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 whitespace-nowrap"
              >
                {t("cta.submit")}
                <ArrowLeft size={19} aria-hidden />
              </Link>
              <span className="font-body-md text-[13px] text-fg-muted">{t("cta.secondary")}</span>
            </div>
          </div>
        </div>
      </section>

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
