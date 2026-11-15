// @ts-check
"use client";

// MEH-3248 (B3): the confirmation after an account deletion. Replaces the
// settings-page «grace» panel, which promised a 30-day undo that never
// existed (deletion is immediate, services/user_deletion.py).
import StatusPage from "@/components/StatusPage";
import { useTranslations } from "next-intl";

export default function AccountDeletedClient() {
  const t = useTranslations("account_deleted");
  const nav = useTranslations("errors.producer_not_found");
  return (
    <StatusPage
      testid="account-deleted"
      icon="seed"
      title={t("heading")}
      body={t("body")}
      primary={{ href: "/", label: nav("home") }}
    />
  );
}
