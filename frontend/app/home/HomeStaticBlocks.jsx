"use client";

import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";
import FadeInSection from "@/components/FadeInSection";

// PREMIUM_DESIGN: hype tags that scroll in the marquee between sections.
const MARQUEE_ITEMS = [
  "🌿 ללא מעובד",
  "🥩 ממרעה",
  "🧀 אורגני",
  "🍞 מחמצת",
  "🫒 כתית",
  "🌱 טרי ואמיתי",
  "✅ מאומת",
  "📍 מקומי",
];

/**
 * MARQUEE STRIP (PREMIUM_DESIGN)
 * Infinite scrolling hype tags between categories + producers.
 * The list is rendered twice so the -50% translate loops cleanly.
 * Pauses on hover; respects prefers-reduced-motion.
 */
export function HomeMarquee() {
  return (
    <div
      className="bg-primary overflow-hidden marquee-edge-fade"
      style={{
        padding: "14px 0",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
      aria-hidden="true"
    >
      <div className="marquee-track">
        {[0, 1].map((loop) => (
          <div key={loop} className="flex items-center" style={{ gap: "48px" }}>
            {MARQUEE_ITEMS.map((text) => (
              <span
                key={`${loop}-${text}`}
                className="font-body whitespace-nowrap text-light"
                style={{
                  fontSize: 14,
                  letterSpacing: "0.06em",
                }}
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FOUNDER QUOTE CARD (LAUNCH_CHECKLIST fix 4)
 * Hand-off between the abstract category grid and the concrete
 * producer grid. Establishes personal voice before browse mode.
 */
export function HomeFounderQuote() {
  return (
    <FadeInSection className="max-w-4xl mx-auto px-4 mb-8">
      <Link
        href="/about"
        className="group flex items-center gap-6 bg-white rounded-[20px] border border-border p-6 md:p-8 hover:shadow-[0_4px_24px_rgba(46,104,83,0.08)] transition focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="w-20 h-20 rounded-full bg-light flex items-center justify-center shrink-0" aria-hidden="true">
          <Leaf size={36} weight="duotone" className="text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-headline italic text-site-text text-lg md:text-xl leading-relaxed mb-2">
            &ldquo;אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית.&rdquo;
          </p>
          <p className="font-body text-sm text-primary group-hover:underline">
            ספיר, מייסדת מהמקור →
          </p>
        </div>
      </Link>
    </FadeInSection>
  );
}

/**
 * HOW IT WORKS — three-step explainer block.
 */
export function HomeHowItWorks() {
  return (
    <section className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection>
        <h2 className="font-headline font-bold text-site-text text-center mb-10" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
          איך זה עובד?
        </h2>
      </FadeInSection>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        {[
          { step: "01", title: "מצאי", text: "גלי בתי עסק קרובים אלייך — ירקות טריים, גבינות מהחווה, לחם מחמצת" },
          { step: "02", title: "צרי קשר", text: "דברי ישירות עם בית העסק בוואטסאפ, בטלפון או באינסטגרם" },
          { step: "03", title: "קבלי", text: "אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות" },
        ].map((step, idx) => (
          <FadeInSection key={step.step} delay={idx * 0.12}>
            <div className="font-english text-5xl text-accent mb-2">{step.step}</div>
            <h3 className="font-headline text-2xl font-bold mb-2">{step.title}</h3>
            <p className="text-site-text/85 leading-relaxed">{step.text}</p>
          </FadeInSection>
        ))}
      </div>
    </section>
  );
}
