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
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-sm font-medium transition hover:brightness-95"
      style={{
        backgroundColor: "#25D366",
        color: "white",
      }}
      aria-label="שתפי את העסק בוואטסאפ"
    >
      <span aria-hidden>💬</span>
      שתפי עם חברות
    </a>
  );
}
