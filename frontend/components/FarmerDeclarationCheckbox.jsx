// @ts-check
/**
 * Module:   FarmerDeclarationCheckbox
 * Purpose:  The grower line («גידלתי בחלקתי בלבד») as a checkbox, for a
 *           business that moves into ירקות/פירות after registration.
 * Does NOT: decide when it is needed (lib/farmer-declaration.js) or record it
 *           (services/farmer_declaration.py does, on PUT /producers/me).
 * History:  MEH-3137 (creation).
 */
import { useTranslations } from "next-intl";
import Checkbox from "@/components/ui/Checkbox";

/** @param {{ checked: boolean, onChange: (v: boolean) => void, testId?: string }} props */
export default function FarmerDeclarationCheckbox({ checked, onChange, testId = "categories-farmer" }) {
  // Register copy, reused word for word.
  const tReg = useTranslations("auth.register.producer");
  return (
    <Checkbox
      className="mt-4 flex items-start gap-2 text-sm"
      boxClassName="mt-0.5"
      data-testid={testId}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    >
      <span className="leading-relaxed text-fg-muted">{tReg("terms.farmer_declaration")}</span>
    </Checkbox>
  );
}
