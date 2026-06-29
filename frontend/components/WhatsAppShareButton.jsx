"use client";

import { useTranslations } from "next-intl";
import { WhatsappLogo } from "@phosphor-icons/react";

/**
 * WhatsApp share button for producer pages — the viral loop.
 * Opens wa.me with a pre-filled message that includes the producer name,
 * city, and a link back to the profile.
 */
export default function WhatsAppShareButton({ producer, url }) {
  const t = useTranslations("whatsapp.share_button");
  if (!producer) return null;

  const shareUrl =
    url ||
    (typeof window !== "undefined"
      ? `${window.location.origin}${producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`}`
      : "");

  const text = t("default_message", { name: producer.name, url: shareUrl });

  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-[10px] text-sm font-medium border border-border bg-white text-[#1C1A17] hover:bg-[#F5F0E8] transition"
      aria-label={t("share_aria")}
    >
      <WhatsappLogo size={18} weight="fill" className="text-[#25D366]" aria-hidden="true" />
      {t("share_to_friend")}
    </a>
  );
}
