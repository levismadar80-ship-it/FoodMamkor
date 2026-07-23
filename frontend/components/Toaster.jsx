"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Info, WarningCircle } from "@phosphor-icons/react";
import { getToasts, subscribe } from "@/lib/toast";

const ICON_SIZE = 18;

// MEH-685: default icon per semantic type. A toast's own `icon` (passed via
// showToast.success(msg, { icon })) overrides this. Icons inherit the toast's
// white text via currentColor — no explicit color needed.
const DEFAULT_ICONS = {
  success: <CheckCircle size={ICON_SIZE} weight="fill" />,
  error: <WarningCircle size={ICON_SIZE} weight="fill" />,
  info: <Info size={ICON_SIZE} weight="fill" />,
};

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
      // MEH-1367 (Sapir decision — content-width with a floor+ceiling). The
      // width authority lives on the toast ITEM, not this container: a `fixed`
      // element with `width:fit-content` + a 50% start-inset only ever gets ~half
      // the viewport (~187px @375) of layout width, which sits below the 16rem
      // floor — so `w-fit` here floored every long toast at 256px and it never
      // reached the ceiling (measured: cssLeft 187.5px, computedW 256px,
      // item max-content 382px). Fix: give the container a viewport-driven width
      // (`w-[92vw] max-w-[28rem]`) and `items-center` so the flex column does not
      // stretch its child; the item then sizes itself via `w-fit min-w-[16rem]
      // max-w-full` (see below), so short toasts stay snug at the 16rem floor and
      // long ones fill up to 92vw/28rem and wrap to ~2 lines.
      // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[2000] w-[92vw] max-w-[28rem] flex flex-col-reverse items-center gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => {
        // MEH-685: bespoke icon wins; otherwise default for the type.
        // start-of-row position is handled by the flex `gap-3` (RTL-safe — no
        // physical margin). aria-hidden: the message text carries meaning.
        const icon = t.icon ?? DEFAULT_ICONS[t.type] ?? null;
        return (
        <div
          key={t.id}
          className={[
            "pointer-events-auto w-fit min-w-[16rem] max-w-full px-5 py-3 rounded-[12px] shadow-lg text-sm font-medium flex items-center gap-3",
            "animate-[toast-in_200ms_ease-out]",
            t.type === "error"
              ? "bg-red-600 text-white"
              : t.type === "info"
                ? "bg-primary-dark text-white"
                : "bg-primary text-white",
          ].join(" ")}
        >
          {icon && (
            <span className="shrink-0 flex items-center" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1">{t.message}</span>
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
        );
      })}
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
