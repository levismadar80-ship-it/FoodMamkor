/**
 * MEH-3820 — the cookie banner's height is known before the first paint.
 *
 * /map reserves the banner's strip under the map while the visitor has not
 * answered (app/globals.css, `[data-map-banner-reserve]`). That reserve reads
 * --cookie-banner-h. The banner used to publish it only from an effect, i.e.
 * after hydration (~5 s on a throttled phone), so the map shrank under the
 * reader. The server-HTML copy now carries a tiny inline script that publishes
 * the height as the banner is parsed.
 *
 * The script is run here the way the browser runs it: as its own code, with
 * document.currentScript pointing at it. jsdom has no layout, so the banner's
 * offsetHeight is given.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CookieBanner from "@/components/CookieBanner";

const tree = () => (
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    <CookieBanner />
  </NextIntlClientProvider>
);
const root = document.documentElement;
const published = () => root.style.getPropertyValue("--cookie-banner-h");

/** Puts the server HTML in the page and runs its inline script as the parser would. */
function parseServerHtml(bannerHeight) {
  const host = document.createElement("div");
  host.innerHTML = renderToString(tree());
  document.body.appendChild(host);
  const script = host.querySelector("script");
  if (script) {
    const banner = script.previousElementSibling;
    Object.defineProperty(banner, "offsetHeight", { configurable: true, value: bannerHeight });
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    new Function(script.textContent)();
    delete document.currentScript;
  }
  return host;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  root.removeAttribute("data-cookie-answered");
  root.style.removeProperty("--cookie-banner-h");
});

describe("MEH-3820 — --cookie-banner-h before hydration", () => {
  it("the server HTML publishes the banner's height as it is parsed", () => {
    parseServerHtml(92);
    expect(published()).toBe("92px");
  });

  it("publishes nothing for a visitor who already answered (that copy is hidden)", () => {
    root.setAttribute("data-cookie-answered", "");
    parseServerHtml(92);
    expect(published()).toBe("");
  });

  it("publishes nothing for a banner with no height", () => {
    parseServerHtml(0);
    expect(published()).toBe("");
  });

  it("the script is gone once the banner has mounted", () => {
    window.ResizeObserver = class { observe() {} disconnect() {} };
    localStorage.removeItem("cookieConsent");
    const { container } = render(tree());
    expect(container.querySelector(".cookie-banner")).not.toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
