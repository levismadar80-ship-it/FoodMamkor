// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Module:   OwnerInviteConsents
 * Purpose:  The terms box, the licensing declaration and (for a grower line)
 *           the farmer declaration, shared by both ways of accepting an owner
 *           invite: a new account (OwnerInviteClient) and an account that
 *           already exists (OwnerInviteExistingAccount, MEH-3256 D8).
 * Does NOT: validate or submit — the two forms own their own state and
 *           requests. The copy comes from `auth.register.producer` by KEY so
 *           there is still one wording for the declaration.
 * History:  MEH-3256 (moved out of OwnerInviteClient so the second form does
 *           not carry a copy of it).
 */

const LINK_CLASS =
  "text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current";
const BOX_CLASS = "w-5 h-5 accent-primary mt-0.5 flex-shrink-0";

/**
 * @param {{
 *   terms: boolean, onTerms: (v: boolean) => void,
 *   declaration: boolean, onDeclaration: (v: boolean) => void,
 *   farmerRequired: boolean, farmer: boolean, onFarmer: (v: boolean) => void,
 * }} props
 */
export default function OwnerInviteConsents(props) {
  const tReg = useTranslations("auth.register.producer");
  return (
    <>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          data-testid="owner-invite-terms"
          checked={props.terms}
          onChange={(e) => props.onTerms(e.target.checked)}
          className={BOX_CLASS}
        />
        <span className="leading-relaxed text-fg-muted">
          {tReg("terms.intro")}{" "}
          <Link href="/terms" target="_blank" className={LINK_CLASS}>{tReg("terms.tos_link")}</Link>{" "}
          {tReg("terms.and")}<Link href="/privacy" target="_blank" className={LINK_CLASS}>{tReg("terms.privacy_link")}</Link>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          data-testid="owner-invite-declaration"
          checked={props.declaration}
          onChange={(e) => props.onDeclaration(e.target.checked)}
          className={BOX_CLASS}
        />
        <span className="leading-relaxed text-fg-muted">{tReg("terms.declaration")}</span>
      </label>

      {props.farmerRequired && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid="owner-invite-farmer"
            checked={props.farmer}
            onChange={(e) => props.onFarmer(e.target.checked)}
            className={BOX_CLASS}
          />
          <span className="leading-relaxed text-fg-muted">{tReg("terms.farmer_declaration")}</span>
        </label>
      )}
    </>
  );
}
