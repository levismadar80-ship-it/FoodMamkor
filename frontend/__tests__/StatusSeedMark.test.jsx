import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import he from "../messages/he.json";

/**
 * MEH-2833 PR 9 (seed layer, board 9 v2 option א) — every status/«not found»
 * page that used the Leaf as the brand mark shows the whole logo, small
 * (SeedMark ~76px); the Leaf is retired there and in the experience-submit
 * toasts. Copy rows 1–2: «גלו בתי עסק במפה».
 */

vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import StatusPage from "@/components/StatusPage";
import { SEED_FILLS } from "@/lib/brand-seeds";

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("StatusPage icon=\"seed\"", () => {
  it("renders the intact logo bloom at 76px, aria-hidden — not a Phosphor icon", () => {
    const { container } = render(<StatusPage icon="seed" title="t" />);
    const svg = container.querySelector("svg[data-seed-mark]");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("width")).toBe("76");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect([...svg.querySelectorAll("[data-seed]")].map((p) => p.getAttribute("fill"))).toEqual(SEED_FILLS);
  });

  it("other icons still render as before", () => {
    const Icon = (props) => <svg data-testid="other-icon" {...props} />;
    const { getByTestId } = render(<StatusPage icon={Icon} title="t" />);
    expect(getByTestId("other-icon").getAttribute("width")).toBe(null);
  });
});

describe("the Leaf is retired as the brand mark", () => {
  it.each([
    "app/[locale]/not-found.js",
    "app/[locale]/producer/[id]/not-found.js",
    "app/[locale]/[slug]/ProducerGone.jsx",
    "app/[locale]/delivery-waitlist/host-confirm/HostConfirmClient.jsx",
    "app/[locale]/delivery-waitlist/unsubscribe/UnsubscribeClient.jsx",
    "app/[locale]/events/[id]/EventDetailClient.jsx",
    "app/[locale]/experiences/[id]/ExperienceDetailClient.jsx",
    "app/[locale]/producer/dashboard/experiences/new/page.js",
    "app/[locale]/producer/dashboard/experiences/[id]/edit/page.js",
  ])("%s no longer imports Leaf", (file) => {
    expect(read(file)).not.toMatch(/\bLeaf\b/);
  });

  it("the status callers pass icon=\"seed\"", () => {
    for (const f of ["app/[locale]/not-found.js", "app/[locale]/producer/[id]/not-found.js", "app/[locale]/[slug]/ProducerGone.jsx", "app/[locale]/delivery-waitlist/host-confirm/HostConfirmClient.jsx"]) {
      expect(read(f)).toContain('icon="seed"');
    }
    expect(read("app/[locale]/delivery-waitlist/unsubscribe/UnsubscribeClient.jsx")).toContain('icon={ok ? "seed" : LinkBreak}');
  });
});

describe("copy rows 1–2", () => {
  it("«גלו בתי עסק במפה» on both not-found pages", () => {
    expect(he.errors.not_found.discover).toBe("גלו בתי עסק במפה");
    expect(he.errors.producer_not_found.discover).toBe("גלו בתי עסק במפה");
  });
});
