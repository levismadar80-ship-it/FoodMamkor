/**
 * MEH-3827 — small shared controls reach a 44×44 hit area without moving the
 * layout (DESIGN.md «Interactive sizing minimums»).
 *
 * Two halves, because jsdom has no layout:
 *   1. The `.tap-area` utility really compiles, through the repo's own
 *      tailwind.config.js and globals.css, to a ::before whose insets grow a
 *      small box to 44px and leave a big one alone.
 *   2. Each shared control that was measured under 44px on staging (24/11
 *      screenChecks sweep) renders with that utility.
 * Checking a class is the fallback MEH-3531 allows where nothing runs the
 * layout; the size itself was measured in Chromium with screenChecks
 * (MEH-3816, PR #5288), which counts a ::before hit area — see PR #5293.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "../tailwind.config.js";

vi.mock("@/lib/use-badge-copy", async () => (await import("./helpers/he-badge-copy")).badgeCopyMock);
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import BackLink from "@/components/ui/BackLink";
import InfoTooltip from "@/components/InfoTooltip";
import Breadcrumb from "@/components/Breadcrumb";
import BadgeRow from "@/components/BadgeRow";

const INSET = "min(0px, calc((100% - 44px) / 2))";

async function compiled() {
  const css = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");
  const cfg = {
    ...config,
    content: [{ raw: '<a class="tap-area"></a>' }],
    corePlugins: { ...(config.corePlugins || {}), preflight: false },
  };
  return (await postcss([tailwind(cfg)]).process(css, { from: undefined })).css;
}

describe(".tap-area compiles to a 44px ::before hit area", () => {
  it("emits the pseudo with both inset axes and a positioned host", async () => {
    const css = await compiled();
    const before = css.match(/\.tap-area::before\s*\{([^}]*)\}/);
    expect(before, ".tap-area::before rule not emitted").not.toBeNull();
    expect(before[1]).toContain('content: ""');
    expect(before[1]).toContain("position: absolute");
    expect(before[1]).toContain(`inset-block: ${INSET}`);
    expect(before[1]).toContain(`inset-inline: ${INSET}`);
    expect(css).toMatch(/\.tap-area\s*\{\s*position: relative;?\s*\}/);
  });
});

describe("shared small controls carry .tap-area", () => {
  it("BackLink (measured 20px tall)", () => {
    render(<BackLink href="/" label="חזרה" />);
    expect(screen.getByRole("link", { name: "חזרה" }).classList.contains("tap-area")).toBe(true);
  });

  it("InfoTooltip «i» trigger (measured 16px)", () => {
    render(<InfoTooltip content="עזרה" label="מידע" />);
    expect(screen.getByRole("button", { name: "מידע" }).classList.contains("tap-area")).toBe(true);
  });

  it("every linked Breadcrumb crumb (measured 24px), not the current page", () => {
    render(<Breadcrumb items={[{ href: "/", label: "בית" }, { href: "/events", label: "אירועים" }, { label: "כאן" }]} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const a of links) expect(a.classList.contains("tap-area")).toBe(true);
    expect(screen.getByText("כאן").classList.contains("tap-area")).toBe(false);
  });

  it("every BadgeRow chip button (measured 24px)", () => {
    render(
      <BadgeRow
        producer={{
          verification_tier: "verified",
          verification_doc_type: "license",
          verified_at: "2026-06-05",
          is_recommended: true,
          days_since_created: 5,
        }}
      />,
    );
    const chips = screen.getAllByRole("button");
    expect(chips.length).toBeGreaterThanOrEqual(2);
    for (const b of chips) expect(b.classList.contains("tap-area"), b.getAttribute("aria-label")).toBe(true);
  });
});
