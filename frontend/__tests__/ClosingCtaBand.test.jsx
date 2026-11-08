import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import ClosingCtaBand from "@/components/ClosingCtaBand";
import { HomeCTA } from "@/app/[locale]/home/HomeStaticBlocks";

/**
 * MEH-2824 — the shared full-green closing band (extracted from /join's,
 * MEH-2799 SPEC §1.8). One look on every page that ends with a business call
 * to action; the button is BusinessCtaLink, so who is looking decides it.
 */

let authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));

const J = he.join;
const DASHBOARD = he.account.menu.dashboard;

function renderBand(props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <ClosingCtaBand
        title={J.closing.heading}
        body={J.closing.line}
        ctaHref="/register/producer"
        ctaLabel={J.cta}
        data-testid="band"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const classes = (el) => (el?.getAttribute("class") || "").split(/\s+/);

beforeEach(() => {
  authState = { user: null, loading: false };
});

describe("ClosingCtaBand — who sees which button", () => {
  it("guest: the join button, to the signup form", () => {
    renderBand();
    const link = screen.getByRole("link", { name: J.cta });
    expect(link.getAttribute("href")).toMatch(/\/register\/producer$/);
  });

  it("producer: «לוח הבקרה שלי» to the dashboard, and no join button", () => {
    authState = { user: { role: "producer" }, loading: false };
    renderBand();
    expect(screen.getByRole("link", { name: DASHBOARD }).getAttribute("href")).toMatch(/\/producer\/dashboard$/);
    expect(screen.queryByRole("link", { name: J.cta })).toBeNull();
  });

  it("admin: no button at all — the band still renders", () => {
    authState = { user: { role: "admin" }, loading: false };
    renderBand();
    expect(screen.getByTestId("band")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("ClosingCtaBand — the one look", () => {
  it("full brand green, meets the footer, inverted mark hidden from screen readers", () => {
    renderBand();
    const band = screen.getByTestId("band");
    expect(band.tagName).toBe("SECTION");
    expect(classes(band)).toEqual(expect.arrayContaining(["bg-primary", "text-background"]));
    expect(band.hasAttribute("data-meets-footer")).toBe(true);
    const mark = band.querySelector("img");
    expect(mark.getAttribute("src")).toContain("logo-inverted.svg");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.getAttribute("alt")).toBe("");
  });

  it("the button is cream on green with a focus ring that shows on green", () => {
    renderBand();
    const link = screen.getByRole("link", { name: J.cta });
    expect(classes(link)).toEqual(
      expect.arrayContaining([
        "bg-background",
        "text-primary",
        "focus-visible:ring-gold-on-dark",
        "focus-visible:ring-offset-primary",
      ]),
    );
  });

  it("title is the band's only h2", () => {
    renderBand();
    const h2s = screen.getByTestId("band").querySelectorAll("h2");
    expect(h2s).toHaveLength(1);
    expect(h2s[0].textContent).toBe(J.closing.heading);
  });

  it("several body lines render as several paragraphs, in order", () => {
    renderBand({ body: ["שורה א", "שורה ב", "שורה ג"] });
    const texts = [...screen.getByTestId("band").querySelectorAll("p")].map((p) => p.textContent);
    expect(texts).toEqual(["שורה א", "שורה ב", "שורה ג"]);
  });

  it("meta and contact are opt-in: absent by default", () => {
    renderBand();
    const band = screen.getByTestId("band");
    expect(band.textContent).not.toContain(J.meta_line);
    expect(band.textContent).not.toContain(J.closing.question);
    expect(screen.queryByRole("link", { name: J.draft.cta })).toBeNull();
  });

  it("meta line and «שאלה לפני? כתבו לנו» when asked for", () => {
    renderBand({ meta: J.meta_line, contact: true });
    const band = screen.getByTestId("band");
    expect(band.textContent).toContain(J.meta_line);
    expect(band.textContent).toContain(J.closing.question);
    expect(screen.getByRole("link", { name: J.draft.cta }).getAttribute("href")).toMatch(/\/contact$/);
  });

  it("call-site attributes reach the section (the /join sticky bar watches data-join-closing)", () => {
    renderBand({ "data-join-closing": "", id: "join" });
    const band = screen.getByTestId("band");
    expect(band.hasAttribute("data-join-closing")).toBe(true);
    expect(band.id).toBe("join");
  });

  it("ctaTestId lands on the guest button only", () => {
    renderBand({ ctaTestId: "band-cta" });
    expect(screen.getByTestId("band-cta").textContent).toBe(J.cta);
  });
});

describe("home: the closing business section is the shared band", () => {
  function renderHomeCta() {
    return render(
      <NextIntlClientProvider locale="he" messages={he}>
        <HomeCTA />
      </NextIntlClientProvider>,
    );
  }

  it("full green, meets the footer, neutral-plural heading (Sapir 08/11)", () => {
    renderHomeCta();
    const band = screen.getByTestId("home-cta");
    expect(classes(band)).toContain("bg-primary");
    expect(band.hasAttribute("data-meets-footer")).toBe(true);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("יש לכם עסק? בואו אלינו");
  });

  it("keeps its three body lines and its own button label, verbatim", () => {
    renderHomeCta();
    const band = screen.getByTestId("home-cta");
    for (const line of [he.home.cta.body_l1, he.home.cta.body_l2, he.home.cta.body_l3]) {
      expect(band.textContent).toContain(line);
    }
    expect(screen.getByRole("link", { name: he.home.cta.button }).getAttribute("href")).toMatch(/\/register\/producer$/);
  });
});
