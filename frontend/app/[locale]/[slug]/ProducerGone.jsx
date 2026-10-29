"use client";

// MEH-2534: what the URL of a DELETED business shows. The backend answers 410
// for a slug held by an ownerless `retired_slugs` tombstone (MEH-2528), so the
// visitor is told the business left the site rather than "page not found" —
// the link she followed was real. Same layout as producer/[id]/not-found.js;
// the two buttons reuse its keys.
// MEH-2422: locale-aware Link, so the buttons keep /en on /en/… pages.
import { Leaf } from "@phosphor-icons/react";
import StatusPage from "@/components/StatusPage";
import { useTranslations } from "next-intl";

export default function ProducerGone() {
  const t = useTranslations("errors.producer_gone");
  const nav = useTranslations("errors.producer_not_found");
  // MEH-2567: shared StatusPage layout; copy and testid unchanged.
  return (
    <StatusPage
      testid="producer-gone"
      icon={Leaf}
      title={t("heading")}
      body={t("message")}
      primary={{ href: "/map", label: nav("discover") }}
      secondary={{ href: "/", label: nav("home") }}
    />
  );
}
