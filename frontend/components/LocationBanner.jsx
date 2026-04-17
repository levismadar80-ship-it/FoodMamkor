"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "@phosphor-icons/react";

const DISMISS_KEY = "location_banner_dismissed";

export default function LocationBanner({ hasCity, onOpenModal }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasCity) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [hasCity]);

  if (!visible || hasCity) return null;

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };

  return (
    <div
      className="mx-4 md:mx-auto max-w-3xl mb-6 flex items-center justify-between gap-3 rounded-[10px] px-4 py-3"
      style={{ backgroundColor: "#EAF3DE", color: "#2e6853" }}
      role="status"
    >
      <div className="flex items-center gap-2 min-w-0">
        <MapPin size={20} weight="fill" className="shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium truncate">
          איפה את? נמצא עסקים קרובים אליך
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenModal}
          className="bg-primary text-white text-sm font-medium px-4 py-1.5 rounded-[8px] hover:bg-primary-light transition whitespace-nowrap"
        >
          בחרי עיר
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="w-7 h-7 rounded-full hover:bg-primary/10 flex items-center justify-center transition"
          aria-label="סגור באנר"
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
