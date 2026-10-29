"use client";

import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";

// MEH-2422: no logo of its own — the site header above already carries it
// (here and in the global 404, which now renders the same chrome).
// MEH-2567: the layout is the shared StatusPage (this page was its model).
export default function NotFound() {
  const t = useTranslations("errors.not_found");
  return (
    <StatusPage
      icon={Leaf}
      eyebrow="404"
      title={t("heading")}
      body={t("message")}
      primary={{ href: "/", label: t("home") }}
      secondary={{ href: "/map", label: t("discover") }}
    />
  );
}
