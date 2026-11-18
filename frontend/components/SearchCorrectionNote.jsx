// @ts-check
"use client";

/**
 * Module:   SearchCorrectionNote
 * Purpose:  Tell the person that the hero search re-read their query on the
 *           other keyboard layout ("sca" -> «דבש»), and let them search for
 *           exactly what they typed instead (Google's "Showing results for /
 *           Search instead for" pattern).
 * Does NOT: decide whether to correct — the backend does, and reports it in
 *           `corrected_query` (backend/app/routers/search.py, MEH-3415).
 * History:  MEH-3415 (creation; copy approved word for word by Sapir 18/11).
 */

import { useTranslations } from "next-intl";

const LATIN = /[a-z]/i;

/**
 * @param {{ corrected: string, original: string, onSearchAsTyped: () => void }} props
 */
export default function SearchCorrectionNote({ corrected, original, onSearchAsTyped }) {
  const t = useTranslations("search.hero");
  // The "keyboard was on English" line is only true when what was typed is
  // Latin; for the reverse slip (Hebrew typed, English meant) it is skipped.
  const typedOnEnglish = LATIN.test(original);
  return (
    // Not an option of the listbox it sits in: the input keeps focus while
    // arrow keys move over result rows, and Tab from the field reaches this
    // button (blur does not close the dropdown — HeroSearch onBlur). The
    // live region announces the correction to a screen reader.
    <div
      data-testid="hero-search-correction"
      role="status"
      aria-live="polite"
      className="px-3 py-2.5 border-b border-border bg-background text-sm"
    >
      <p>{t.rich("corrected_showing", { word: corrected, strong: (chunks) => (
            <strong>
              <bdi>{chunks}</bdi>
            </strong>
          ), })}</p>
      <p className="mt-0.5 text-xs text-fg-muted">
        {typedOnEnglish && (
          <>
            {t.rich("corrected_typed", {
              original,
              bdi: (chunks) => <bdi>{chunks}</bdi>,
            })}{" "}
          </>
        )}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onSearchAsTyped}
          className="text-primary underline hover:no-underline"
        >
          {t.rich("corrected_search_as_typed", {
            original,
            bdi: (chunks) => <bdi>{chunks}</bdi>,
          })}
        </button>
      </p>
    </div>
  );
}
