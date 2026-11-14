/**
 * MEH-3059 — «כל בתי העסק» shows its own frame while it renders, not the
 * site-wide brand loader.
 *
 * /producers reads ?page=N, so it renders per request and Next can only
 * prefetch it down to the nearest loading.js. Without a loading.js of its own
 * that was app/[locale]/loading.js — the beige logo screen (data-testid
 * route-loading) — and the real page then replaced it. The route now has
 * app/[locale]/producers/loading.js, which must exist (Next picks the NEAREST
 * one by file location, so deleting it silently brings the logo screen back)
 * and must render the page's real H1 and grid skeleton.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import { rootClientMessages } from "@/lib/client-messages";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const FILE = path.resolve(__dirname, "..", "app", "[locale]", "producers", "loading.js");

describe("MEH-3059: /producers has its own loading boundary", () => {
  it("app/[locale]/producers/loading.js exists (else the root brand loader shows)", () => {
    expect(fs.existsSync(FILE)).toBe(true);
  });

  it("renders the page's real H1, the breadcrumb and the card-grid skeleton — never the brand loader", async () => {
    const { default: ProducersLoading } = await import(/* @vite-ignore */ FILE);
    render(
      <NextIntlClientProvider locale="he" messages={rootClientMessages(he)}>
        <ProducersLoading />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(he.producers.title.all);
    // The breadcrumb's last crumb and the H1 carry the same words.
    expect(screen.getAllByText(he.producers.breadcrumb.all)).toHaveLength(2);
    expect(screen.getByRole("status", { name: he.common.skeleton.loading_businesses })).toBeTruthy();
    expect(screen.queryByTestId("route-loading")).toBeNull();
  });
});

// Fresh reviewer on #4423: a loading.js covers every segment below it, so the
// index skeleton (H1 «כל בתי העסק», 7xl grid) would also flash on the diet and
// category/region pages, which have their own title and frame. Every nested
// segment directly under producers/ must carry its own loading.js, and it must
// not be the index skeleton.
const PRODUCERS_DIR = path.dirname(FILE);
const nestedSegments = fs
  .readdirSync(PRODUCERS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("MEH-3059: nested /producers/** segments keep the site-wide loader", () => {
  it("finds the nested segments it guards (diet, [category])", () => {
    expect(nestedSegments).toEqual(expect.arrayContaining(["diet", "[category]"]));
  });

  for (const seg of nestedSegments) {
    it(`producers/${seg}/loading.js exists and is not the «כל בתי העסק» skeleton`, async () => {
      const file = path.join(PRODUCERS_DIR, seg, "loading.js");
      expect(fs.existsSync(file), `${seg} would inherit the index skeleton and flash its H1`).toBe(true);
      const { default: SegmentLoading } = await import(/* @vite-ignore */ file);
      render(
        <NextIntlClientProvider locale="he" messages={rootClientMessages(he)}>
          <SegmentLoading />
        </NextIntlClientProvider>,
      );
      expect(screen.queryByTestId("producers-loading")).toBeNull();
      expect(screen.queryByText(he.producers.title.all)).toBeNull();
    });
  }
});
