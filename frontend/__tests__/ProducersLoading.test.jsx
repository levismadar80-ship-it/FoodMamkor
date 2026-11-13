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
