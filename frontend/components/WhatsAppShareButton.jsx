"use client";

/**
 * WhatsApp share button for producer pages — the viral loop.
 * Opens wa.me with a pre-filled message that includes the producer name,
 * city, and a link back to the profile.
 */
export default function WhatsAppShareButton({ producer, url }) {
  if (!producer) return null;

  const shareUrl =
    url ||
    (typeof window !== "undefined"
      ? `${window.location.origin}${producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`}`
      : "");

  const text = `גיליתי את ${producer.name} במהמקור — ${shareUrl}`;

  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-[10px] text-sm font-medium border border-[#e8e0d0] bg-white text-[#1C1A17] hover:bg-[#F5F0E8] transition"
      aria-label="שתפי את העסק בוואטסאפ"
    >
      <span aria-hidden>💬</span>
      שלחי לחברה
    </a>
  );
}
