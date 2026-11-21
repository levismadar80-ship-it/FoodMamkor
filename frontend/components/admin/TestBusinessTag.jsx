// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { useTestBusinessIds } from "@/lib/use-test-business-ids";

/**
 * MEH-2952 chunk 4: the admin list's marker for a business hidden as a test
 * row. Renders nothing while loading, nothing for a real business.
 * @param {{ producerId: string }} props
 */
export default function TestBusinessTag({ producerId }) {
  const t = useTranslations("admin.producers.test_business");
  const ids = useTestBusinessIds();
  if (!ids || !ids.has(String(producerId))) return null;
  return (
    <span
      data-testid="admin-tag-test-business"
      title={t("label")}
      className="inline-flex items-center rounded-full bg-background-alt text-text border border-border px-1.5 py-0.5 text-2xs font-medium"
    >
      {t("label")}
    </span>
  );
}
