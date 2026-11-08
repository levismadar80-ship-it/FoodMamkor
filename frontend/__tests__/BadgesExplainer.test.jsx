/**
 * MEH-2701 — /about/badges is generated from BADGE_CONFIG.
 * Guards: every badge key appears exactly once, inside the section of its own
 * evidence group; every group present in BADGE_CONFIG has a section; the
 * section ids are the anchors BadgeRow links to.
 */
import { heBadgeCopy } from "./helpers/he-badge-copy";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "@/messages/he.json";
import {
  BADGE_CONFIG,
  BADGE_EVIDENCE_ORDER,
  badgesByEvidence,
  badgeExplainerHref,
} from "@/lib/badges";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/chip-icons", () => ({ badgeIcon: () => null }));
vi.mock("@/components/BadgeRow", () => ({
  COLOR_CLASSES: { primary: "p", accent: "a", secondary: "s", muted: "m" },
  // MEH-2827: the verified item renders BadgeRow's presentational chip face.
  VerifiedChip: ({ label, className }) => (
    <span data-testid="verified-chip" className={className}>
      {label}
    </span>
  ),
}));

import BadgesExplainer from "@/app/[locale]/about/badges/BadgesExplainer";

function renderPage() {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <BadgesExplainer />
    </NextIntlClientProvider>,
  );
}

describe("BadgesExplainer (MEH-2701)", () => {
  // MEH-2716: «מצילים מזון» is listed only while the rescue pilot is on; the
  // full-list guards below run with it on so they still cover every key.
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("leaves «מצילים מזון» out while the rescue pilot is off, and keeps «חדש»", () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    renderPage();
    expect(screen.queryByTestId("badges-item-rescue_saving")).toBeNull();
    expect(screen.getByTestId("badges-item-new")).toBeTruthy();
  });

  it("lists every BADGE_CONFIG key once, inside its own evidence group", () => {
    renderPage();
    const keys = Object.keys(BADGE_CONFIG);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const items = screen.getAllByTestId(`badges-item-${key}`);
      expect(items).toHaveLength(1);
      const group = screen.getByTestId(`badges-group-${BADGE_CONFIG[key].evidence}`);
      expect(within(group).getByTestId(`badges-item-${key}`)).toBe(items[0]);
      expect(items[0].textContent).toContain(heBadgeCopy(BADGE_CONFIG[key]).label);
      expect(items[0].textContent).toContain(heBadgeCopy(BADGE_CONFIG[key]).tooltip);
    }
  });

  it("covers every evidence value used in BADGE_CONFIG", () => {
    const used = new Set(Object.values(BADGE_CONFIG).map((b) => b.evidence));
    for (const ev of used) expect(BADGE_EVIDENCE_ORDER).toContain(ev);
    expect(badgesByEvidence().map((g) => g.evidence)).toEqual(
      BADGE_EVIDENCE_ORDER.filter((ev) => used.has(ev)),
    );
  });

  it("anchors each section at the id the badge popover links to", () => {
    const { container } = renderPage();
    for (const b of Object.values(BADGE_CONFIG)) {
      const [, hash] = badgeExplainerHref(b).split("#");
      expect(container.querySelector(`[id="${hash}"]`)).not.toBeNull();
    }
  });

  it("renders the in-sentence links with their targets", () => {
    renderPage();
    const verified = screen.getByTestId("badges-group-admin-verified");
    expect(within(verified).getByRole("link").getAttribute("href")).toBe("/about/process");
    const declared = screen.getByTestId("badges-group-self-declared");
    expect(within(declared).getByRole("link").getAttribute("href")).toBe("/contact");
    expect(declared.textContent).not.toContain("<link>");
  });

  it("has a heading and intro for every group in he and en", async () => {
    const en = (await import("@/messages/en.json")).default;
    for (const ev of BADGE_EVIDENCE_ORDER) {
      for (const m of [he, en]) {
        expect(m.about_badges.groups[ev].heading).toBeTruthy();
        expect(m.about_badges.groups[ev].intro).toBeTruthy();
      }
    }
  });
});

describe("MEH-2827 · badges shown exactly as readers see them", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("«מאומת» is the gold seal chip, not the green pill", () => {
    renderPage();
    const item = screen.getByTestId("badges-item-verified");
    const chip = within(item).getByTestId("verified-chip");
    expect(chip.textContent).toBe(he.badges.verified.label);
    // The green pill was COLOR_CLASSES.primary ("p" in this mock).
    expect(item.querySelector(".p")).toBeNull();
  });

  it("«מובילת קהילה» is listed FIRST in the automatic group, with its tooltip text", () => {
    renderPage();
    const group = screen.getByTestId("badges-group-system");
    const first = group.querySelector("ul > li");
    expect(first.getAttribute("data-testid")).toBe("badges-item-community_leader");
    expect(first.textContent).toContain(he.trust.tier_4.label);
    expect(first.querySelector("p").textContent).toBe(he.trust.tier_4.tooltip);
  });
});

