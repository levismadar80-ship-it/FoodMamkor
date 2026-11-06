/**
 * MEH-2740 (MEH-1687 phase 7b) — badge words come from messages, per locale.
 *
 * lib/badges.js no longer carries label/tooltip; useBadgeCopy() reads
 * `badges.<key>.label|tooltip`. This pins: every BADGE_CONFIG key has both
 * strings in he AND en; the hook returns them under a real provider; and the
 * English site no longer gets Hebrew.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { BADGE_CONFIG } from "@/lib/badges";
import { useBadgeCopy } from "@/lib/use-badge-copy";

const HEBREW = /[֐-׿]/;
const KEYS = Object.keys(BADGE_CONFIG);

function Probe({ k }) {
  const b = useBadgeCopy()(BADGE_CONFIG[k]);
  return (
    <p data-testid="probe">
      {b.label}|{b.tooltip}
    </p>
  );
}

describe("badge copy lives in messages (MEH-2740)", () => {
  it("the registry holds no words of its own", () => {
    for (const k of KEYS) {
      expect(BADGE_CONFIG[k].label, k).toBeUndefined();
      expect(BADGE_CONFIG[k].tooltip, k).toBeUndefined();
    }
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s has a label and a tooltip for every badge, and nothing extra", (_loc, msgs) => {
    expect(Object.keys(msgs.badges).sort()).toEqual([...KEYS].sort());
    for (const k of KEYS) {
      expect(msgs.badges[k].label, k).toBeTruthy();
      expect(msgs.badges[k].tooltip, k).toBeTruthy();
    }
  });

  it("no English badge string contains Hebrew", () => {
    for (const k of KEYS) {
      expect(en.badges[k].label, k).not.toMatch(HEBREW);
      expect(en.badges[k].tooltip, k).not.toMatch(HEBREW);
    }
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("useBadgeCopy resolves through a real %s provider", (locale, msgs) => {
    render(
      <NextIntlClientProvider locale={locale} messages={msgs}>
        <Probe k="recommended" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe(
      `${msgs.badges.recommended.label}|${msgs.badges.recommended.tooltip}`,
    );
  });
});
