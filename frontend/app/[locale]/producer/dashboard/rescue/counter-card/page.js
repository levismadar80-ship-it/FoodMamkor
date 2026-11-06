import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Route:    /producer/dashboard/rescue/counter-card
 * Purpose:  The A5 card that sits by the till: ask for the code, check it,
 *           hand the bag over, mark it.
 * Does NOT: generate a PDF. Sapir's call (04/11) — a print-styled route, so
 *           the business prints from the browser and nothing has to render,
 *           store or serve a document.
 * History:  MEH-2649 (creation)
 */
export default async function CounterCardPage() {
  if (!rescueBagsEnabled()) notFound();
  const t = await getTranslations("rescue.counter_card");

  return (
    <main className="min-h-screen bg-surface" data-testid="rescue-counter-card">
      {/* Screen-only: the button must never appear on the paper. */}
      <div className="print:hidden px-4 py-3 border-b border-border">
        <p className="font-body-sm text-sm text-fg-muted">{t("print_hint")}</p>
      </div>

      {/* A5 is 148×210mm. The card is sized in mm so what prints matches what
          the business expects to tape beside the till. */}
      <article
        className="mx-auto bg-surface text-black px-8 py-10"
        style={{ width: "148mm", minHeight: "210mm" }}
      >
        <h1 className="font-headline-md text-3xl font-black mb-1">{t("title")}</h1>
        <p className="font-body-sm text-base mb-8">{t("subtitle")}</p>

        <ol className="space-y-5">
          {["ask", "check", "hand", "mark"].map((step, i) => (
            <li key={step} className="flex gap-4 items-start" data-testid={`counter-step-${step}`}>
              <span
                aria-hidden="true"
                className="font-headline-md text-2xl font-black shrink-0"
                style={{ minWidth: "1.5rem" }}
              >
                {i + 1}
              </span>
              <span className="font-body-md text-lg leading-snug">{t(`step.${step}`)}</span>
            </li>
          ))}
        </ol>

        <p className="font-body-sm text-sm mt-10 leading-relaxed">{t("footer")}</p>
      </article>
    </main>
  );
}
