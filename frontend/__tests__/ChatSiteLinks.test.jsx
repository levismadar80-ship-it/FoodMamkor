// The chat widget links exactly the site paths on lib/site-pages.js and
// leaves every other path as text, so a made-up path never 404s (20/11).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import { splitSiteLinks, SITE_PAGES } from "../lib/site-pages";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

import ChatMessageText from "../components/ChatMessageText";

describe("splitSiteLinks", () => {
  it("turns a listed path into a link and keeps the text around it", () => {
    expect(splitSiteLinks("המחירון בעמוד /join/pricing. תודה")).toEqual([
      { type: "text", value: "המחירון בעמוד " },
      { type: "link", href: "/join/pricing", key: "pricing" },
      { type: "text", value: ". תודה" },
    ]);
  });

  it("leaves an unlisted path, a URL and a mid-word slash as text", () => {
    for (const text of ["ראו /join/pricing-old", "https://example.com/map", "a/map", "1/2"]) {
      expect(splitSiteLinks(text).every((p) => p.type === "text")).toBe(true);
    }
  });

  it("links a path written with a trailing slash and keeps the slash as text", () => {
    expect(splitSiteLinks("ראו /map/ עכשיו")).toEqual([
      { type: "text", value: "ראו " },
      { type: "link", href: "/map", key: "map" },
      { type: "text", value: "/ עכשיו" },
    ]);
  });

  it("links a path written right after a Hebrew letter", () => {
    expect(splitSiteLinks("ב/map").map((p) => p.type)).toEqual(["text", "link"]);
  });

  it("returns no parts for an empty answer", () => {
    expect(splitSiteLinks("")).toEqual([]);
  });

  it("has a Hebrew label for every listed page", () => {
    for (const key of Object.values(SITE_PAGES)) expect(he.chat.pages[key]).toBeTruthy();
  });
});

describe("ChatMessageText", () => {
  it("renders each listed path as a link labelled with the page name", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he}>
        <ChatMessageText text="המחירון בעמוד /join/pricing, וההרשמה ב-/register/producer." />
      </NextIntlClientProvider>,
    );
    const links = screen.getAllByTestId("chat-site-link");
    expect(links.map((a) => [a.getAttribute("href"), a.textContent])).toEqual([
      ["/join/pricing", he.chat.pages.pricing],
      ["/register/producer", he.chat.pages.register_business],
    ]);
  });
});
