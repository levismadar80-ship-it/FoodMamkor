/* eslint-disable max-lines, max-lines-per-function */
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Leaf, Plus, Minus } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
import ParallaxQuote from "@/components/ParallaxQuote";

const TIP_KEYS = ["eggs", "grass_fed", "honey"];
const VALUE_KEYS = ["transparency", "proximity", "quality", "safety"];

export default function AboutPage() {
  const t = useTranslations("about.consumer");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [contactStatus, setContactStatus] = useState(null);
  const [contactMsg, setContactMsg] = useState("");
  const [openTip, setOpenTip] = useState(null);
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

  return (
    <div>
      {/* ======== Section 1 — Hero ======== */}
      <section className="relative text-white overflow-hidden py-20 md:py-28">
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage:
              "url(https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&auto=format&q=80&fm=webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(46,74,46,0.82) 0%, rgba(46,74,46,0.88) 100%)",
          }}
        />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-headline text-4xl md:text-6xl font-bold mb-6 leading-tight">
            {t("hero.heading")}
          </h1>
        </div>
      </section>

      {/* ======== Section 2 — Sapir's story ======== */}
      <section className="bg-background section-y">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* Founder photo — Path C editorial portrait (MEH-100) */}
            <div className="flex justify-center md:justify-start order-1">
              <div
                className="relative w-[280px] h-[373px] md:w-[360px] md:h-[480px] rounded-xl bg-light flex items-center justify-center border border-primary/15 overflow-hidden"
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
            </div>
            <div className="order-2 text-right">
              <div
                className="text-site-text/85 font-body text-lg space-y-5"
                style={{ lineHeight: "1.8" }}
              >
                <p className="font-headline font-bold text-site-text text-2xl">{t("story.greeting")}</p>
                <p>{t("story.p1")}</p>
                <p>{t("story.p2")}</p>
                <p>{t("story.p3")}</p>
                <p>{t("story.p4")}</p>
                <p>{t("story.p5")}</p>
                <div className="border-s-2 border-primary/40 ps-4 mt-2 space-y-3">
                  <p className="text-base text-site-text/85 italic leading-relaxed">
                    {t("story.caption1")}
                  </p>
                  <p className="text-base text-site-text/85 italic leading-relaxed">
                    {t("story.caption2")}
                  </p>
                  <p className="text-base text-site-text/85 italic leading-relaxed">
                    {t("story.caption3")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Parallax divider */}
      <ParallaxQuote
        image="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&auto=format&q=80&fm=webp"
        quote={t("parallax.quote")}
        overlayOpacity={0.7}
        height="350px"
      />

      {/* ======== Section 3 — 3 columns ======== */}
      <section className="bg-primary text-white section-y">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <h3 className="font-headline text-2xl font-bold mb-4">{t("benefits.local.title")}</h3>
              <p className="text-light/90 leading-relaxed font-body whitespace-pre-line">
                {t("benefits.local.body")}
              </p>
            </div>
            <div className="text-center">
              <h3 className="font-headline text-2xl font-bold mb-4">{t("benefits.trust.title")}</h3>
              <p className="text-light/90 leading-relaxed font-body whitespace-pre-line">
                {t("benefits.trust.body")}
              </p>
            </div>
            <div className="text-center">
              <h3 className="font-headline text-2xl font-bold mb-4">{t("benefits.community.title")}</h3>
              <p className="text-light/90 leading-relaxed font-body whitespace-pre-line">
                {t("benefits.community.body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== Section 4 — Tips accordion ======== */}
      <section className="max-w-3xl mx-auto px-4 section-y">
        <h2 className="font-headline text-3xl font-bold mb-8 text-center text-site-text">
          {t("tips.heading")}
        </h2>
        <div className="space-y-3">
          {TIP_KEYS.map((key, i) => (
            <div key={key} className="border border-border rounded-[12px] overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setOpenTip(openTip === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-4 text-right font-medium text-site-text hover:bg-background transition"
                aria-expanded={openTip === i}
                aria-controls={`tip-panel-${i}`}
              >
                <span>{t(`tips.${key}.question`)}</span>
                {openTip === i ? (
                  <Minus size={18} weight="bold" className="text-primary shrink-0" aria-hidden="true" />
                ) : (
                  <Plus size={18} weight="bold" className="text-primary shrink-0" aria-hidden="true" />
                )}
              </button>
              {openTip === i && (
                <div id={`tip-panel-${i}`} className="px-6 pb-5 pt-4 text-site-text/85 leading-relaxed border-t border-border">
                  {t(`tips.${key}.answer`)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ======== Section 5 — Testimonials ======== */}
      <section className="bg-background section-y border-y border-border">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-headline text-3xl font-bold mb-4 text-site-text">
            {t("testimonials.heading")}
          </h2>
          <p className="text-fg-muted text-lg mb-6">{t("testimonials.subtitle")}</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            {t("testimonials.cta")}
          </Link>
        </div>
      </section>

      {/* ======== Section 6 — Values ======== */}
      <section className="bg-white section-y border-y border-border">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="font-headline text-3xl font-bold mb-6 text-center text-site-text">
            {t("values.heading")}
          </h2>
          <p className="text-site-text/85 text-right text-lg leading-relaxed mb-10">
            {t("values.intro")}
          </p>
          <div className="space-y-8 text-right">
            {VALUE_KEYS.map((key) => (
              <article key={key}>
                <h3 className="font-headline font-bold text-2xl text-site-text mb-3">
                  {t(`values.${key}.title`)}
                </h3>
                <p className="text-site-text/85 text-lg leading-relaxed">
                  {t(`values.${key}.body`)}
                </p>
              </article>
            ))}
          </div>
          <p className="text-site-text/85 text-right text-lg leading-relaxed mt-12 pt-8 border-t border-border">
            {t("values.closing")}
          </p>
        </div>
      </section>

      {/* ======== Section 7 — CTA for businesses ======== */}
      <section className="section-y bg-background border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline text-4xl font-bold mb-8 text-site-text">
            {t("cta.heading")}
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register/producer"
              className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-[8px] hover:bg-primary-light transition font-semibold text-lg"
            >
              {t("cta.register")}
              <Leaf size={20} weight="duotone" aria-hidden="true" />
            </Link>
            <Link
              href="/map"
              className="bg-white text-primary border border-primary px-8 py-3 rounded-[8px] hover:bg-light transition font-semibold text-lg"
            >
              {t("cta.explore")}
            </Link>
          </div>
        </div>
      </section>

      {/* ======== Contact form ======== */}
      <section className="bg-background section-y border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline text-4xl font-bold text-site-text mb-3">{t("contact.heading")}</h2>
          <p className="text-fg-muted font-body text-base mb-10">
            {t("contact.subtitle")}
          </p>

          <form onSubmit={handleContact} className="space-y-4 text-right">
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium text-site-text mb-1">
                {t("contact.name_label")}
              </label>
              <input
                id="contact-name"
                type="text"
                required
                placeholder={t("contact.name_placeholder")}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full bg-white border border-border rounded-[8px] px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium text-site-text mb-1">
                {t("contact.email_label")}
              </label>
              <input
                id="contact-email"
                type="email"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="w-full bg-white border border-border rounded-[8px] px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="contact-message" className="block text-sm font-medium text-site-text mb-1">
                {t("contact.message_label")}
              </label>
              <textarea
                id="contact-message"
                required
                rows={4}
                placeholder={t("contact.message_placeholder")}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                className="w-full bg-white border border-border rounded-[8px] px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={contactStatus === "loading"}
              className="bg-primary text-white px-8 py-3 rounded-[8px] hover:bg-primary-light transition font-medium w-full md:w-auto disabled:opacity-60"
            >
              {contactStatus === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <ButtonSpinner />
                  {t("contact.submit_loading")}
                </span>
              ) : (
                t("contact.submit")
              )}
            </button>

            {contactMsg && (
              <p
                role="status"
                aria-live="polite"
                className={`text-center text-sm ${
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
