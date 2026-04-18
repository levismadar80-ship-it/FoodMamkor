"use client";

import { useEffect, useState } from "react";
import { getToasts, subscribe } from "@/lib/toast";

/**
 * Renders the toast queue fixed to the bottom-center of the viewport.
 * Listens to the module-level toast store. Mount once in layout.js.
 */
export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const update = () => setToasts([...getToasts()]);
    update();
    return subscribe(update);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[2000] flex flex-col-reverse gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "pointer-events-auto px-5 py-3 rounded-[12px] shadow-lg text-sm font-medium flex items-center gap-3",
            "animate-[toast-in_200ms_ease-out]",
            t.type === "error"
              ? "bg-red-600 text-white"
              : t.type === "info"
                ? "bg-primary-dark text-white"
                : "bg-primary text-white",
          ].join(" ")}
        >
          <span>{t.message}</span>
          {t.action && (
            <a
              href={t.action.href}
              className="underline underline-offset-2 font-semibold whitespace-nowrap hover:opacity-90"
              data-testid="toast-action"
            >
              {t.action.label}
            </a>
          )}
        </div>
      ))}
      <style jsx>{`
        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
