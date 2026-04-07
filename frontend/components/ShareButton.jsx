"use client";

import { useState } from "react";

export default function ShareButton({ url, title }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!url) return;
    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: title || "מהמקור", url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // last-resort fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-2 bg-white border border-border px-3 py-2 rounded-[12px] hover:bg-background transition text-sm"
        title="שתף לינק"
        aria-label="שתף לינק"
      >
        <span aria-hidden>🔗</span>
        <span className="hidden sm:inline">שתף</span>
      </button>
      {copied && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[2000] bg-primary text-white px-4 py-2 rounded-[12px] shadow-lg text-sm"
        >
          הלינק הועתק! ✓
        </div>
      )}
    </>
  );
}
