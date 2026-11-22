// @ts-check
"use client";

/**
 * Module:   HowSteps
 * Purpose:  «איך זה עובד» as numbered steps, one look for every offer page
 *           (group buy, rescue bag). Airbnb draws stays and experiences from
 *           one set of listing sections; two offers on one site should read
 *           the same way (Sapir 21/11).
 * Does NOT: decide the steps — the page passes them already translated.
 * History:  MEH-3597 (creation; style taken from the rescue bag page, MEH-3586)
 *
 * @param {{ title: string, steps: string[], headingId: string, testId?: string }} props
 */
import SectionHeading from "@/components/ui/SectionHeading";

export default function HowSteps({ title, steps, headingId, testId }) {
  if (!steps.length) return null;
  return (
    <section aria-labelledby={headingId} data-testid={testId}>
      <SectionHeading size="content" id={headingId} className="mb-3">{title}</SectionHeading>
      <ol className="grid gap-3">
        {steps.map((line, i) => (
          <li key={line} className="flex items-start gap-3 text-base text-text">
            <span aria-hidden="true" className="w-7 h-7 rounded-full bg-green-50 text-primary font-bold grid place-items-center shrink-0 numeric">
              {i + 1}
            </span>
            <span className="pt-0.5">{line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
