// @ts-check
"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { loginLinkFor } from "@/lib/safe-redirect";
import Button, { buttonLook } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import IconButton from "@/components/ui/IconButton";
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * Module:   HostAddCta
 * Purpose:  The «הוסיפו חוויה / אירוע» call to action on a public list. A
 *           business owner goes straight to the dashboard form; anyone else
 *           gets a short dialog that sends her to business sign-up (and, when
 *           signed out, to sign-in with a return to the form).
 * Does NOT: hold the form (the dashboard page does — it is long, needs an
 *           approved business and would be lost on a stray close), or gate
 *           anything: the dashboard layout and the API stay the authority.
 * Related:  components/BusinessCtaLink.jsx (same role split for /join);
 *           app/[locale]/producer/dashboard/DashboardLayoutClient.jsx:225
 *           (401 → /login) and :243 (403 → «אין גישה») — the two dead ends a
 *           visitor used to hit from this link.
 * History:  MEH-3969 (creation — the three add links on /events and
 *           /experiences pointed every visitor at the dashboard).
 *
 * @param {{
 *   href: string,
 *   kind: "experiences" | "events",
 *   variant?: string,
 *   size?: string,
 *   className?: string,
 *   leadingIcon?: any,
 *   trailingIcon?: any,
 *   testId?: string,
 *   children?: any,
 * }} props
 */
export default function HostAddCta({ href, kind, variant = "primary", size = "md", className = "", leadingIcon, trailingIcon, testId, children }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  // Admin: no add CTA — admins work from a separate account (BusinessCtaLink).
  if (!loading && user?.role === "admin") return null;

  // A business owner (or while auth resolves — the dashboard gate still holds)
  // goes straight to the form, as before.
  if (loading || user?.role === "producer") {
    return (
      <Link href={href} data-testid={testId} className={`${buttonLook(variant, size)} ${className}`.trim()}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </Link>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
        data-testid={testId}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      {open && <HostGateDialog href={href} kind={kind} signedIn={!!user} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * @param {{ href: string, kind: "experiences" | "events", signedIn: boolean, onClose: () => void }} props
 */
function HostGateDialog({ href, kind, signedIn, onClose }) {
  const t = useTranslations("events.list.host_gate");
  // Shared keys, not copies (messages-hygiene): the X and the sign-up label
  // the dashboard's «אין גישה» state already uses for the same move.
  const tCommon = useTranslations("common.aria");
  const tDenied = useTranslations("errors.access_denied.producer");
  const locale = useLocale();
  const titleId = useId();
  return (
    <Dialog labelledBy={titleId} onClose={onClose} testId="host-gate" size="sm" className="relative text-center">
      {/* MEH-2038: X at end-3, symmetric px on a centred panel. */}
      <IconButton
        label={tCommon("close")}
        onClick={onClose}
        data-autofocus
        className="absolute top-3 end-3 w-11 h-11 rounded-full hover:bg-green-50 flex items-center justify-center text-fg-muted"
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </IconButton>
      <SectionHeading size="content" id={titleId} className="mt-6 px-6 leading-snug">
        {kind === "experiences" ? t("title_experiences") : t("title_events")}
      </SectionHeading>
      <p className="mt-2 text-sm text-fg-muted leading-relaxed">{t("body")}</p>
      <Link href="/register/producer" data-testid="host-gate-register" className={`${buttonLook("primary", "md")} mt-5 w-full`}>
        {tDenied("cta")}
      </Link>
      {!signedIn && (
        <Link
          href={loginLinkFor(href, locale === "en" ? "/en" : "")}
          data-testid="host-gate-login"
          className="mt-3 min-h-touch inline-flex items-center text-sm font-medium text-primary underline underline-offset-4"
        >
          {t("login")}
        </Link>
      )}
    </Dialog>
  );
}
