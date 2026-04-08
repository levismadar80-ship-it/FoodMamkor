"use client";

import { showToast } from "@/lib/toast";

export default function ShareButton({ url, title }) {
  const handleShare = async () => {
    if (!url) return;
    // Try native share first (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: title || "מהמקור", url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("הועתק לקליפבורד 🔗");
    } catch {
      // last-resort fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("הועתק לקליפבורד 🔗");
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 bg-white border border-border px-3 py-2 rounded-[8px] hover:bg-light transition text-sm focus-visible:ring-2 focus-visible:ring-primary/40"
      title="שתף לינק"
      aria-label="שתף לינק לעסק"
    >
      <span aria-hidden>🔗</span>
      <span className="hidden sm:inline">שתף</span>
    </button>
  );
}
