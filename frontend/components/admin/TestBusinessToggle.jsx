// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import Switch from "@/components/ui/Switch";
import { SetTestBusinessAdminTestBusinessesProducerIdPutResponse } from "@/lib/generated/api.zod";
import { setTestBusinessId, useTestBusinessIds } from "@/lib/use-test-business-ids";

/**
 * Module:   TestBusinessToggle
 * Purpose:  «עסק בדיקה — מוסתר מהאתר» on the admin edit screen (MEH-2952
 *           chunk 4). On: the business leaves every public page and every
 *           send; off: it comes back exactly as it was (status untouched).
 * Touches:  PUT /admin/test-businesses/{id} with `{ hidden }`.
 * Does NOT: Send the column name — the body key is `hidden`
 *           (tests/test_meh2952_is_test_guards.py guard 2, frontend).
 * History:  MEH-2952 chunk 4 (creation); MEH-3872 (row height held while
 *           the ids load).
 * @param {{ producerId: string }} props
 */
export default function TestBusinessToggle({ producerId }) {
  const t = useTranslations("admin");
  const ids = useTestBusinessIds();
  const [saving, setSaving] = useState(false);
  // MEH-3872: until the ids answer, hold the row's height (mt-3 + 24px line)
  // so the panels under the header don't drop by 36px on a phone.
  if (!ids) return <div className="mt-3 h-6" aria-hidden="true" data-testid="admin-test-business-toggle-pending" />;
  const hidden = ids.has(String(producerId));

  const onChange = async () => {
    setSaving(true);
    try {
      const r = await api.put(`/admin/test-businesses/${producerId}`, { hidden: !hidden });
      const saved = SetTestBusinessAdminTestBusinessesProducerIdPutResponse.parse(r.data);
      await setTestBusinessId(producerId, saved.hidden);
      showToast.success(t("common.saved"));
    } catch {
      showToast.error(t("common.error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <Switch
        checked={hidden}
        disabled={saving}
        onClick={onChange}
        aria-labelledby="admin-test-business-label"
        data-testid="admin-test-business-toggle"
      />
      <span id="admin-test-business-label" className="text-sm font-medium">
        {t("producers.test_business.label")}
      </span>
    </div>
  );
}
