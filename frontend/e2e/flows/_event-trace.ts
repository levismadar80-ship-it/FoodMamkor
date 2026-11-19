/**
 * Module:   _event-trace
 * Purpose:  STRESS-PROBE ONLY (MEH-3380 · MEH-3154 · MEH-3449). Records, inside
 *           the page, which DOM events reached which node and which XHR/fetch
 *           calls the page opened, so a "click that sent nothing" can say
 *           whether the click arrived, whether a submit fired, and whether the
 *           page issued a request at all.
 * Does NOT: assert or wait. Lives on a throwaway branch that is never merged.
 */
import type { Page } from "@playwright/test";

export async function installEventTrace(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const w = window as unknown as { __evt?: string[] };
      if (w.__evt) return;
      const log: string[] = (w.__evt = []);
      const now = () => Math.round(performance.now());
      const name = (n: EventTarget | null) => {
        const el = n as HTMLElement | null;
        if (!el || !el.tagName) return String(n);
        const fiber = Object.keys(el).some((k) => k.startsWith("__reactFiber"));
        return `${el.tagName}[${el.getAttribute("data-testid") ?? el.id ?? ""}]"${(el.textContent ?? "").trim().slice(0, 16)}" conn=${el.isConnected} react=${fiber} dis=${(el as HTMLButtonElement).disabled ?? ""}`;
      };
      for (const type of ["pointerdown", "mousedown", "mouseup", "click", "submit", "input", "focusin", "focusout"]) {
        document.addEventListener(type, (e) => log.push(`${now()} ${type} ${name(e.target)} trusted=${e.isTrusted}`), true);
        // Bubble phase on window: was it stopped / default-prevented on the way?
        window.addEventListener(type, (e) => { if (type === "click" || type === "submit") log.push(`${now()} ${type}@window defaultPrevented=${e.defaultPrevented}`); });
      }
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        log.push(`${now()} xhr.open ${method} ${String(url).slice(0, 80)}`);
        this.addEventListener("loadend", () => log.push(`${now()} xhr.loadend ${method} ${String(url).slice(0, 60)} status=${this.status}`));
        return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
      } as typeof open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...a: unknown[]) {
        log.push(`${now()} xhr.send`);
        return (send as (...x: unknown[]) => void).apply(this, a);
      } as typeof send;
      const f = window.fetch;
      window.fetch = (...a: Parameters<typeof fetch>) => {
        log.push(`${now()} fetch ${String((a[0] as Request)?.url ?? a[0]).slice(0, 80)}`);
        return f(...a);
      };
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of Array.from(m.removedNodes)) {
          const el = n as HTMLElement;
          if (el.querySelector?.("form, button, input") || ["FORM", "BUTTON", "INPUT"].includes(el.tagName)) log.push(`${now()} REMOVED ${name(el)}`);
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
      log.push(`${now()} trace installed at ${location.pathname}${location.search}${location.hash}`);
    })
    .catch(() => undefined);
}

export async function readEventTrace(page: Page): Promise<string> {
  const lines = await Promise.race([
    page.evaluate(() => {
      const w = window as unknown as { __evt?: string[] };
      return w.__evt ? [...w.__evt.slice(-60), `${Math.round(performance.now())} read at ${location.pathname}${location.search}`] : ["<no trace in this document — it was replaced after install>", location.pathname + location.search];
    }).catch((e: Error) => [`<trace read failed: ${e.message.split("\n")[0]}>`]),
    new Promise<string[]>((r) => setTimeout(() => r(["<trace read timed out>"]), 2_000)),
  ]);
  return "\n\nevent trace (STRESS PROBE):\n  " + lines.join("\n  ");
}
