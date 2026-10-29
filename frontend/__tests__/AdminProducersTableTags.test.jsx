/**
 * MEH-2521 — the admin queue's trait tags show only what a public surface
 * shows.
 *
 * Removed: the organic Leaf (MEH-1259 removed the public organic badge), the
 * has_delivery Truck (delivery is derived from delivery areas, MEH-1836/2046)
 * and the pickup_points Package (pickup comes from ProducerLocation rows,
 * MEH-2046/2060). Retargeted: the ✡ used to light up for ANY free-text
 * `producer.kosher` string; it now follows VERIFIED kashrut — the predicate of
 * the public kosher badge (lib/badges.js, MEH-986 + MEH-1260 expiry).
 *
 * The assertions count the rendered <svg> icons rather than looking for a
 * test id, because an absence check keyed on an id only the new code emits
 * would pass against the old code too. Every case carries a positive control
 * (grass_fed's Cow, which this card leaves alone) so a "0 icons" cannot come
 * from icons not rendering at all.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProducerTags } from "@/app/[locale]/admin/producers/AdminProducersTable";
import { BADGE_CONFIG } from "@/lib/badges";

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

const DAY = 24 * 60 * 60 * 1000;
const past = (days) => new Date(Date.now() - days * DAY).toISOString();
const future = (days) => new Date(Date.now() + days * DAY).toISOString();

function icons(producer) {
  const { container } = render(<ProducerTags producer={producer} />);
  return container.querySelectorAll("svg");
}

describe("Admin ProducerTags — dead tags removed (MEH-2521)", () => {
  it("CONTROL — grass_fed still renders exactly one icon", () => {
    expect(icons({ grass_fed: true })).toHaveLength(1);
  });

  it("organic_certified, has_delivery and pickup_points render NO icon", () => {
    const producer = {
      grass_fed: true, // control: exactly this one survives
      organic_certified: true,
      has_delivery: true,
      pickup_points: true,
    };
    expect(icons(producer)).toHaveLength(1);
  });

  it("none of the three removed tag titles is rendered", () => {
    const { container } = render(
      <ProducerTags
        producer={{ organic_certified: true, has_delivery: true, pickup_points: true }}
      />,
    );
    const titles = [...container.querySelectorAll("[title]")].map((el) =>
      el.getAttribute("title"),
    );
    expect(titles).not.toContain("admin.producers.table.tags.organic_certified");
    expect(titles).not.toContain("admin.producers.table.tags.delivery");
    expect(titles).not.toContain("admin.producers.table.tags.pickup_points");
  });
});

describe("Admin ProducerTags — ✡ follows verified kashrut (MEH-2521)", () => {
  it("free-text kosher WITHOUT verification renders no ✡", () => {
    // Only the control icon: the old code rendered a second (StarOfDavid) here.
    expect(icons({ grass_fed: true, kosher: "כשר למהדרין" })).toHaveLength(1);
  });

  it("verified, not expired → one ✡ titled with the verified-kashrut label", () => {
    const { container } = render(
      <ProducerTags
        producer={{ kashrut_verified_at: past(30), kashrut_expires_at: future(30) }}
      />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    const tag = container.querySelector(`[title="${BADGE_CONFIG.kosher.label}"]`);
    expect(tag).not.toBeNull();
    expect(tag.querySelector("svg")).not.toBeNull();
  });

  it("verified with no expiry (legacy row) → one ✡", () => {
    expect(
      icons({ kashrut_verified_at: past(400), kashrut_expires_at: null }),
    ).toHaveLength(1);
  });

  it("verified but EXPIRED → no ✡, even with a free-text kosher string", () => {
    expect(
      icons({
        grass_fed: true, // control
        kosher: "כשר",
        kashrut_verified_at: past(400),
        kashrut_expires_at: past(1),
      }),
    ).toHaveLength(1);
  });
});
