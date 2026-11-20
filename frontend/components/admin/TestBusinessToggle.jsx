// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import Switch from "@/components/ui/Switch";
import { setTestBusinessId, useTestBusinessIds } from "@/lib/use-test-business-ids";

/**
 * Module:   TestBusinessToggle
 * Purpose:  «עסק בדיקה — מוסתר מהאתר» on the admin edit screen (MEH-2952
 *           chunk 4). On: the business leaves every public page and every
 *           send; off: it comes back exactly as it was (status untouched).
 * Touches:  PUT /admin/test-businesses/{id} with `{ hidden }`.
 * Does NOT: Send the column name — the body key is `hidden`
 *           (tests/test_meh2952_is_test_guards.py guard 2, frontend).
 * History:  MEH-2952 chunk 4 (creation).
 * @param {{ producerId: string }} props
 */
export default function TestBusinessToggle({ producerId }) {
  const t = useTranslations("admin");
  const ids = useTestBusinessIds();
  const [saving, setSaving] = useState(false);
  if (!ids) return null;
  const hidden = ids.has(String(producerId));

  const onChange = async () => {
    setSaving(true);
    try {
      const r = await api.put(`/admin/test-businesses/${producerId}`, { hidden: !hidden });
      await setTestBusinessId(producerId, Boolean(r.data?.hidden));
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
