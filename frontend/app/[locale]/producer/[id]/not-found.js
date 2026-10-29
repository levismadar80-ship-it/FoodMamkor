"use client";

import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";

// MEH-2567: shared StatusPage layout (also swaps next/link, which dropped /en,
// for the locale-aware Link inside it). Copy unchanged.
export default function ProducerNotFound() {
  const t = useTranslations("errors.producer_not_found");
  return (
    <StatusPage
      icon={Leaf}
      title={t("heading")}
      body={t("message")}
      primary={{ href: "/map", label: t("discover") }}
      secondary={{ href: "/", label: t("home") }}
    />
  );
}
