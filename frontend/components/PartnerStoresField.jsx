// @ts-check
"use client";

/**
 * Module:   PartnerStoresField
 * Purpose:  The «נמכר דרך חנויות אחרות» answer (MEH-3977): a checkbox, and
 *           under it the store names, comma separated. One control for the
 *           owner's DeliveryCard and the admin create form.
 * Does NOT: validate names (the server trims, dedupes, caps at 10 × 60 chars:
 *           backend/app/schemas/partner_stores.py) or decide the location
 *           rule (callers: place OR delivery OR stores).
 * Related:  components/PartnerStoresLine.jsx (the page side).
 * History:  MEH-3977 (creation).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";

/** "פארמרים, הענתיות ,," → ["פארמרים", "הענתיות"]. */
export function parsePartnerStores(text) {
  return (text || "")
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {{ value: string[], onChange: (stores: string[]) => void, testId?: string }} props
 */
export default function PartnerStoresField({ value, onChange, testId = "partner-stores" }) {
  const t = useTranslations("partner_stores");
  const [open, setOpen] = useState(value.length > 0);
  const [text, setText] = useState(value.join(", "));
  return (
    <div className="space-y-2">
      <Checkbox
        className="flex items-center gap-2 text-sm"
        data-testid={`${testId}-toggle`}
        checked={open}
        onChange={(e) => {
          setOpen(e.target.checked);
          if (!e.target.checked) {
            setText("");
            onChange([]);
          }
        }}
      >
        {t("field_label")}
      </Checkbox>
      {open && (
        <div className="ms-6 border-s-2 border-border ps-4 pt-1">
          <Input
            label={t("names_label")}
            helperText={t("names_hint")}
            placeholder={t("names_placeholder")}
            value={text}
            data-testid={`${testId}-names`}
            onChange={(e) => {
              setText(e.target.value);
              onChange(parsePartnerStores(e.target.value));
            }}
          />
        </div>
      )}
    </div>
  );
}
