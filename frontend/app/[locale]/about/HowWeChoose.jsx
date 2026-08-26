"use client";

/**
 * HowWeChoose — MEH-2193
 *
 * The compact "איך אנחנו בוחרות" fact block on /about, sitting between the
 * founder story and the pull-quote. Three short facts (license-only · manual
 * approval · zero commissions) + a text link to the full acceptance process.
 *
 * Extracted to its own file rather than inlined: AboutClient.jsx already opens
 * with `eslint-disable max-lines, max-lines-per-function`, and this block owns
 * fetch state of its own, which does not belong in a 600-line page component.
 *
 * The live counter is DATA-GATED AND SILENT, modelled on the MEH-1490
 * Google-rating row: it renders only at >= 10 approved businesses, and renders
 * nothing at all below that, on a fetch failure, or before the response lands.
 * No spinner, no placeholder, no reserved height — so the block's layout is
 * identical in every hidden case and nothing shifts when the number arrives.
 * Ten is the floor because a smaller number under-claims the directory rather
 * than describing it.
 *
 * The official license-registry link from the card is deliberately NOT rendered:
 * Sapir has not supplied its URL, and inventing one would put a fabricated
 * external source behind a trust claim. The copy key (`registry_link`) is in
 * he.json/en.json ready for it; only the href is missing.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "@phosphor-icons/react";

import { Link as LocaleLink } from "@/i18n/navigation";
import api from "@/lib/api";

// Below this, the number under-claims the directory instead of describing it.
const MIN_VISIBLE_COUNT = 10;

const FACTS = ["fact1", "fact2", "fact3"];

export default function HowWeChoose() {
  const t = useTranslations("about.choose");
  const [count, setCount] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get("/producers/count")
      .then((res) => {
        const n = Number(res?.data?.count);
        if (active && Number.isFinite(n)) setCount(n);
      })
      .catch(() => {
        /* fail-quiet: the counter line simply never appears */
      });
    return () => {
      active = false;
    };
  }, []);

  const showCount = count !== null && count >= MIN_VISIBLE_COUNT;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-12">
      <p className="block font-body-md text-[13px] font-semibold text-fg-muted mb-3 md:mb-4">
        {t("eyebrow")}
      </p>
      <ul className="space-y-2.5">
        {FACTS.map((fact) => (
          <li
            key={fact}
            className="relative ps-6 font-headline-md font-bold text-primary-dark text-[19px] md:text-xl leading-snug"
          >
            <span
              aria-hidden="true"
              className="absolute start-0 top-2 block w-2.5 h-2.5 rounded-full bg-accent"
            />
            {t(fact)}
          </li>
        ))}
      </ul>
      {showCount && (
        <p data-testid="how-we-choose-count" className="mt-4 font-body-md text-base text-fg-muted">
          {t("count", { count })}
        </p>
      )}
      <LocaleLink
        href="/about/process"
        data-testid="how-we-choose-process-link"
        className="mt-5 inline-flex items-center gap-1 font-body-md font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {t("process_link")}
        <ArrowLeft size={15} aria-hidden="true" />
      </LocaleLink>
    </div>
  );
}
