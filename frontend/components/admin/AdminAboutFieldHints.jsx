"use client";
// @ts-check
/**
 * Module:   AdminAboutFieldHints
 * Purpose:  On the admin business edit page, list the facts the «אודות» text
 *           holds that a field should hold (payment, pickup, cutoffs, fees,
 *           workshops…), so the admin moves each one where the page reads it.
 * Touches:  nothing — reads the producer the page already loaded.
 * Does NOT: decide what counts as a hint (lib/about-field-hints.js) or edit
 *           anything. Renders nothing when there is no hint.
 * Placement: above «ספרו לנו על העסק», the panel that turns free text into
 *           fields, so the admin reads the list and fixes it right below.
 * History:  MEH-3953 (creation).
 */
import { useTranslations } from "next-intl";
import { ListChecks } from "@phosphor-icons/react";
import Heading from "@/components/ui/Heading";
import { aboutFieldHints } from "@/lib/about-field-hints";

/** @param {{ producer: any }} props */
export default function AdminAboutFieldHints({ producer }) {
  const t = useTranslations("admin.producers.about_hints");
  const codes = aboutFieldHints(producer);
  if (codes.length === 0) return null;
  return (
    <section
      data-testid="about-field-hints"
      className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl"
    >
      <Heading level={2} className="mb-2 text-primary flex items-center gap-2">
        <ListChecks size={20} weight="duotone" aria-hidden="true" />
        {t("title")}
      </Heading>
      <p className="text-sm text-fg-muted mb-3">{t("intro")}</p>
      <ul className="list-disc ps-5 space-y-1 text-sm">
        {codes.map((code) => (
          <li key={code} data-hint={code}>{t(code)}</li>
        ))}
      </ul>
    </section>
  );
}
