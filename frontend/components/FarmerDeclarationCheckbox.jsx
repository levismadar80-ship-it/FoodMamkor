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

/** @param {{ checked: boolean, onChange: (v: boolean) => void, testId?: string }} props */
export default function FarmerDeclarationCheckbox({ checked, onChange, testId = "categories-farmer" }) {
  // Register copy, reused word for word.
  const tReg = useTranslations("auth.register.producer");
  return (
    <label className="mt-4 flex items-start gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
      />
      <span className="leading-relaxed text-fg-muted">{tReg("terms.farmer_declaration")}</span>
    </label>
  );
}
