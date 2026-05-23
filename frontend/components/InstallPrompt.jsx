"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

const VISIT_KEY = "pwa_visits";
const DISMISS_KEY = "pwa_dismiss_until";
const DISMISS_MS = 14 * 86400000; // suppress for 14 days after dismiss
const DELAY_MS = 30000; // show 30s after page load

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function lsGet(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode — ignore */ }
}

export default function InstallPrompt() {
  const t = useTranslations("modals.install_prompt");
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const promptRef = useRef(null);

  useEffect(() => {
    if (isStandalone()) return; // already installed — never show

    const dismissedUntil = Number(lsGet(DISMISS_KEY, "0"));
    if (Date.now() < dismissedUntil) return;

    // Increment visit counter; only show on 2nd+ visit
    const visits = Number(lsGet(VISIT_KEY, "0")) + 1;
    lsSet(VISIT_KEY, String(visits));
    if (visits < 2) return;

    const iosDevice = isIOS();
    setIos(iosDevice);

    if (iosDevice) {
      // iOS Safari has no beforeinstallprompt — show manual instructions instead
      const tid = setTimeout(() => setShow(true), DELAY_MS);
      return () => clearTimeout(tid);
    }

    // Android Chrome / desktop: capture the browser's install event
    let tid;
    const onPrompt = (e) => {
      e.preventDefault();
      promptRef.current = e;
      tid = setTimeout(() => setShow(true), DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onPrompt, { once: true });
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(tid);
    };
  }, []);

  const handleInstall = async () => {
    if (promptRef.current) {
      promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      promptRef.current = null;
      setShow(false);
      if (outcome === "dismissed") {
        lsSet(DISMISS_KEY, String(Date.now() + DISMISS_MS));
      }
    } else {
      setShow(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    lsSet(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t("aria_label")}
      className="fixed bottom-24 md:bottom-6 start-4 end-4 md:start-auto md:end-6 md:w-80 bg-white rounded-[16px] shadow-xl border border-border p-4 z-[9997] flex items-start gap-3"
    >
      <span className="text-2xl shrink-0" aria-hidden="true">📲</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-site-text text-sm leading-snug">{t("title")}</p>
        {ios ? (
          <p className="text-xs text-site-muted mt-1 leading-snug">
            {t.rich("ios_instructions", {
              share: (chunks) => <strong>{chunks}</strong>,
              add: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        ) : (
          <>
            <p className="text-xs text-site-muted mt-1 leading-snug">
              {t("android_subtitle")}
            </p>
            <button
              onClick={handleInstall}
              className="mt-2 text-xs font-semibold bg-primary text-white px-3 py-1.5 rounded-full hover:opacity-90 transition"
            >
              {t("android_cta")}
            </button>
          </>
        )}
      </div>
      <button
        onClick={handleDismiss}
        aria-label={t("dismiss_aria")}
        className="shrink-0 text-site-muted hover:text-site-text transition p-1 rounded"
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
