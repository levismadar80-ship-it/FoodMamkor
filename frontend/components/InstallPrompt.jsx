"use client";

import { useEffect, useRef, useState } from "react";
import { X, DeviceMobile } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
// MEH-2927 (pilot B3b): the same predicate BottomNav gates on, imported from
// one place so the two cannot drift — a reviewer found them as byte-identical
// copies with nothing to catch a change to one of them.
import { isRegisterRoute } from "@/lib/register-route";

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
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const promptRef = useRef(null);
  // MEH-2927: the effect below runs once per page load, so it closes over the
  // pathname of the route it mounted on. A ref refreshed every render is how
  // the 30s callback asks where she is NOW rather than where she was 30s ago.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

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

    // MEH-2927 (pilot B3b): the render gate below keeps the card off the
    // registration flow, but on its own it only HIDES — the timer still fired
    // and flipped `show`, so the first navigation out of /register popped the
    // card instantly with no fresh 30s delay. Checking at reveal time instead
    // means a seller who spent those 30s registering is not nagged the moment
    // she leaves; the next page load gets its own timer.
    //
    // Deliberately a reveal-time check and not an effect dependency: adding
    // `pathname` to the deps would re-run this on every client navigation,
    // re-arming the 30s timer each time and counting a fresh visit — a much
    // larger behaviour change than the one being fixed.
    const reveal = () => {
      if (isRegisterRoute(pathnameRef.current)) return;
      setShow(true);
    };

    if (iosDevice) {
      // iOS Safari has no beforeinstallprompt — show manual instructions instead
      const tid = setTimeout(reveal, DELAY_MS);
      return () => clearTimeout(tid);
    }

    // Android Chrome / desktop: capture the browser's install event
    let tid;
    const onPrompt = (e) => {
      e.preventDefault();
      promptRef.current = e;
      tid = setTimeout(reveal, DELAY_MS);
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

  // MEH-2927 (pilot B3b): never over the registration flow. The prompt is
  // `position: fixed` and ~126px tall at the iPhone visual viewport, and a
  // sweep of the DETAILS step's whole scroll range found it over a form
  // control at 16 (scroll position x control) sample points, worst 48px,
  // «הבא» among them. Gated AFTER the hooks, so hook order cannot change
  // between renders.
  //
  // This is the second half of the gate; `reveal` above is the first. Kept as
  // well as, not instead of: it covers a card already revealed before a
  // client navigation INTO the flow.
  //
  // Two effect-level side effects are deliberately NOT gated, and both are
  // once-per-page-load rather than per-route: the visit counter still counts
  // the visit, and `beforeinstallprompt` is still preventDefault()ed, which
  // consumes Chrome's own install affordance for that load. Suppressing
  // either would need the effect to re-run per route — see the note there.
  if (isRegisterRoute(pathname)) return null;
  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t("aria_label")}
      // MEH-2148: bottom-24 (96px) was a static copy of the nav clearance plus a
      // gap. Derived; 72 + 24 = 96 at the fallback, so nothing moves without the
      // var. `md:bottom-6` unchanged and still wins at md+, where no pill renders.
      className="vv-pin fixed bottom-[calc(var(--bottom-nav-clearance,calc(4.5rem+env(safe-area-inset-bottom,0px)))+24px)] md:bottom-6 start-4 end-4 md:start-auto md:end-6 md:w-80 bg-surface rounded-lg shadow-xl border border-border p-4 z-[9997] flex items-start gap-3"
    >
      <DeviceMobile size={28} weight="fill" className="shrink-0 text-primary" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text text-sm leading-snug">{t("title")}</p>
        {ios ? (
          <p className="text-xs text-fg-muted mt-1 leading-snug">
            {t.rich("ios_instructions", {
              share: (chunks) => <strong>{chunks}</strong>,
              add: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        ) : (
          <>
            <p className="text-xs text-fg-muted mt-1 leading-snug">
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
        className="shrink-0 w-11 h-11 inline-flex items-center justify-center text-fg-muted hover:text-text transition rounded-lg"
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
