/**
 * MEH-3983 — a tapped business, event or experience opens on its own frame,
 * not on the site-wide brand loader.
 *
 * The three detail pages render on the server, so Next shows the nearest
 * loading.js while they do. Without one of their own that was
 * app/[locale]/loading.js (data-testid route-loading): a cream screen whose
 * brand mark fades in only after 0.4 s, so a wait of 0.3–0.8 s (prod, 28/11)
 * read as a blank flash between the list and the page. Each route now draws
 * its page-shaped skeleton; the recipe pages under the business route keep
 * the site-wide loader. The frame-by-frame version of this, on a throttled
 * phone, is e2e/flows/manual/nav-throttled.spec.ts (0 blank frames).
 */
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import { rootClientMessages } from "@/lib/client-messages";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const APP = path.resolve(__dirname, "..", "app", "[locale]");

async function renderLoading(rel) {
  const { default: Loading } = await import(/* @vite-ignore */ path.join(APP, rel));
  return render(
    <NextIntlClientProvider locale="he" messages={rootClientMessages(he)}>
      <Loading />
    </NextIntlClientProvider>,
  );
}

const DETAIL_PAGES = [
  { route: "[slug] (business page)", file: "[slug]/loading.js", testId: "producer-page-loading" },
  { route: "events/[id]", file: "events/[id]/loading.js", testId: "event-page-loading" },
  { route: "experiences/[id]", file: "experiences/[id]/loading.js", testId: "experience-page-loading" },
];

describe("MEH-3983: detail pages wait on their own frame", () => {
  for (const page of DETAIL_PAGES) {
    it(`${page.route}: draws its skeleton, announced to screen readers, never the brand loader`, async () => {
      await renderLoading(page.file);
      const frame = screen.getByTestId(page.testId);
      expect(frame.getAttribute("role")).toBe("status");
      expect(frame.textContent + (frame.getAttribute("aria-label") ?? "")).toContain(he.a11y.loading);
      expect(screen.queryByTestId("route-loading")).toBeNull();
      // The footer stays hidden while it is on screen (globals.css, MEH-3878).
      expect(frame.closest("[data-route-loader]")).not.toBeNull();
    });
  }

  it("a recipe page under the business route keeps the site-wide loader, not the business frame", async () => {
    await renderLoading("[slug]/recipes/loading.js");
    expect(screen.getByTestId("route-loading")).toBeTruthy();
    expect(screen.queryByTestId("producer-page-loading")).toBeNull();
  });
});
