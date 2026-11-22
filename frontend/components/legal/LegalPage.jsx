// @ts-check
/**
 * Module:   LegalPage
 * Purpose:  The shell of the three legal pages (privacy, terms, accessibility):
 *           the page heading, its date line(s), and one card per section with
 *           an h2.
 * Does NOT: hold any copy (each page passes its own translated strings),
 *           build metadata (lib/legal-page-metadata.js), or own the pages'
 *           mailto links (privacy and terms style theirs differently).
 * Related:  app/[locale]/{privacy,terms,accessibility}/page.js (callers);
 *           e2e/flows/manual/legal.spec.ts (the page test ids).
 * History:  MEH-3623 (creation: the three pages carried the same 20-line
 *           shell; clone-baseline listed privacy↔terms at 18 windows).
 */
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * @param {{
 *   testId: string,
 *   heading: string,
 *   dateLines: string[],
 *   sections: { id: string, title: string, body: import("react").ReactNode }[],
 * }} props
 */
export default function LegalPage({ testId, heading, dateLines, sections }) {
  return (
    <section className="min-h-screen" data-testid={testId}>
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline-display text-5xl font-bold text-text mb-2">
          {heading}
        </h1>
        {dateLines.map((line, i) => (
          <p
            key={`${i}-${line}`}
            className={`text-fg-muted ${i === dateLines.length - 1 ? "mb-12" : "mb-1"}`}
          >
            {line}
          </p>
        ))}

        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="bg-surface rounded-lg p-7 border border-border shadow-sm"
            >
              <SectionHeading size="content" className="mb-3">
                {section.title}
              </SectionHeading>
              <div className="text-text/85 leading-relaxed">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
