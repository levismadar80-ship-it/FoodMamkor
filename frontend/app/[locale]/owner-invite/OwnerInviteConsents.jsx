// @ts-check
"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Module:   OwnerInviteConsents
 * Purpose:  The consent box and (for a grower line) the farmer declaration,
 *           shared by every way a business takes a page we prepared for it: a
 *           new account (OwnerInviteClient), an account that already exists
 *           (OwnerInviteExistingAccount, MEH-3256 D8) and a draft claim
 *           (claim/ClaimClient).
 * Does NOT: validate or submit — the forms own their own state and requests.
 *           Does not reword the declaration: its full text still comes from
 *           `auth.register.producer.terms.declaration` by KEY, one wording.
 * History:  MEH-3256 (moved out of OwnerInviteClient). MEH-3662: terms and
 *           the licensing declaration became ONE box (Sapir, 21/11). The box
 *           still drives both flags, so the server stamps both exactly as
 *           before; the declaration's text sits behind «הצהרת הרישוי», closed
 *           until she opens it, instead of 45 words inside the label. The
 *           farmer line stays its own box: the server records it apart
 *           (MEH-3137).
 */

const LINK_CLASS =
  "text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current";
const BOX_CLASS = "w-5 h-5 accent-primary mt-0.5 flex-shrink-0";

/**
 * @param {{
 *   terms: boolean, onTerms: (v: boolean) => void,
 *   declaration: boolean, onDeclaration: (v: boolean) => void,
 *   farmerRequired: boolean, farmer: boolean, onFarmer: (v: boolean) => void,
 *   testIdPrefix?: string,
 * }} props
 */
export default function OwnerInviteConsents({ testIdPrefix = "owner-invite", ...props }) {
  const tReg = useTranslations("auth.register.producer");
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const declarationId = useId();
  const accepted = props.terms && props.declaration;
  return (
    <>
      <div>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid={`${testIdPrefix}-consent`}
            checked={accepted}
            onChange={(e) => {
              props.onTerms(e.target.checked);
              props.onDeclaration(e.target.checked);
            }}
            className={BOX_CLASS}
          />
          <span className="leading-relaxed text-fg-muted">
            {tReg.rich("terms.combined", {
              tos: (chunks) => (
                <Link href="/terms" target="_blank" className={LINK_CLASS}>{chunks}</Link>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" target="_blank" className={LINK_CLASS}>{chunks}</Link>
              ),
              // A button inside the label is interactive content, so a click
              // on it opens the text and does not tick the box.
              declaration: (chunks) => (
                <button
                  type="button"
                  aria-expanded={declarationOpen}
                  aria-controls={declarationId}
                  onClick={() => setDeclarationOpen((open) => !open)}
                  data-testid={`${testIdPrefix}-declaration-toggle`}
                  className={LINK_CLASS}
                >
                  {chunks}
                </button>
              ),
            })}
          </span>
        </label>
        {/* Always in the DOM so aria-controls resolves; `hidden` while closed. */}
        <p
          id={declarationId}
          hidden={!declarationOpen}
          className="text-sm leading-relaxed text-fg-muted mt-2 ms-7 rounded-md border border-border bg-background p-3"
          data-testid={`${testIdPrefix}-declaration-text`}
        >
          {tReg("terms.declaration")}
        </p>
      </div>

      {props.farmerRequired && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid={`${testIdPrefix}-farmer`}
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
