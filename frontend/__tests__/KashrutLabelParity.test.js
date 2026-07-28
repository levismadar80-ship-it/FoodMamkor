/**
 * MEH-1711 — the kashrut label says the same thing on the card and on the
 * detail page.
 *
 * Before this ticket the same admin stamp (`kashrut_verified_at`, MEH-986 ch2)
 * produced three different words on three surfaces: the card badge said the
 * bare "כשר" (`lib/badges.js`), the filter chip said "כשרות מאומתת"
 * (`lib/attribute-labels.js:61`, Sapir-LOCKED per MEH-1087), and the detail
 * page said the actual certification name, "חלק"
 * (`KashrutBadgeStrip` quiet variant). MEH-1418 fixed the chip and declared the
 * wording "unified across surfaces" — the badge was never taken in that round.
 *
 * The bare word is the over-claim: it asserts a kashrut standard without naming
 * which one. Industry precedent is ACM v. Booking.com (March 2024) — the
 * regulator's objection was to the self-synthesized label, not the underlying
 * data, and the remedy was naming the third-party certification instead.
 *
 * WHAT THIS FILE ASSERTS, and why each assertion is a different kind:
 *   1. PARITY — the card and the detail page are rendered from the SAME
 *      producer and their label strings are compared with `toBe`. String
 *      equality, not a visual check: the live stack is unreachable from the CC
 *      sandbox (proven 28/07), so screenshots are waived by the ticket's DoD
 *      and this is the substitute evidence.
 *   2. BOTH FALLBACK ARMS — zero codes AND two-plus codes. The seed carries
 *      three verified-kashrut producers and none with 2+ codes
 *      (`seed_demo_producers.py:505-508`, MEH-1706), so the second arm has no
 *      fixture anywhere and is constructed here.
 *   3. WHITELIST PRESERVED — an unknown code must be dropped, not counted.
 *      This is why `CODE_TO_KEY` is imported from its owner rather than
 *      re-derived: `code.replace(/-/g,"_")` yields the same string for every
 *      known code and would pass every other assertion in this file while
 *      silently accepting garbage.
 *   4. GATES UNTOUCHED — `earnsBadge` decides WHO gets the badge; this ticket
 *      only changes WHAT IT SAYS. Asserted directly so a future edit cannot
 *      quietly move the line.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import he from "../messages/he.json";
import { BADGE_CONFIG, allBadges } from "@/lib/badges";
import { CODE_TO_KEY } from "@/components/KashrutBadgeStrip";
import BadgeRow from "@/components/BadgeRow";
import KashrutBadgeStrip from "@/components/KashrutBadgeStrip";

// Resolve real he.json strings so the comparison is between the strings users
// actually see, not between two identical mock echoes.
const at = (obj, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => {
    const full = ns ? `${ns}.${key}` : key;
    const raw = at(he, full);
    return typeof raw === "string" ? raw : full;
  },
  useFormatter: () => ({ dateTime: () => "01/01/2027" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const FUTURE = "2027-07-01T00:00:00Z";

const producerWith = (codes) => ({
  id: "3c3c3c3c-3333-4333-8333-333333333333",
  name: "משק הבוסתן",
  kashrut_badges: codes,
  kashrut_verified_at: "2026-07-01T00:00:00Z",
  kashrut_expires_at: FUTURE,
});

/** The kosher pill's visible text on the CARD, via BadgeRow. */
function cardKosherLabel(producer) {
  const { container } = render(<BadgeRow producer={producer} surface="card" />);
  const pill = container.querySelector('[data-badge="kosher"]');
  return pill ? pill.textContent.trim() : null;
}

/** The kashrut line's visible text on the DETAIL page, via the quiet variant. */
function detailKashrutLabel(producer) {
  const { container } = render(
    <KashrutBadgeStrip
      badges={producer.kashrut_badges}
      verified_at={producer.kashrut_verified_at}
      expires_at={producer.kashrut_expires_at}
      variant="quiet"
    />,
  );
  const line = container.querySelector('[data-testid="kashrut-quiet-line"]');
  return line ? line.textContent.trim() : null;
}

const FALLBACK = "כשרות מאומתת";

describe("MEH-1711 — card/detail label parity", () => {
  it("a single certification renders the SAME string on both surfaces", () => {
    const producer = producerWith(["chalak"]);
    const card = cardKosherLabel(producer);
    const detail = detailKashrutLabel(producer);

    // The certification name, not our invented word.
    expect(card).toBe(he.kashrut.badges.chalak.label); // "חלק"
    // The parity assertion itself — string equality across the two render
    // paths, which is what the screenshot would have been evidence FOR.
    expect(card, "card and detail disagree about the same certification").toBe(detail);
  });

  it("holds for a second certification too (not chalak-specific)", () => {
    const producer = producerWith(["badatz"]);
    expect(cardKosherLabel(producer)).toBe(he.kashrut.badges.badatz.label);
    expect(cardKosherLabel(producer)).toBe(detailKashrutLabel(producer));
  });
});

describe("MEH-1711 — both fallback arms", () => {
  it("ZERO codes -> the locked fallback", () => {
    // Stamp present, no codes: the badge is still earned (MEH-986 gate is the
    // stamp), but there is no certificate to name.
    expect(cardKosherLabel(producerWith([]))).toBe(FALLBACK);
  });

  it("TWO-PLUS codes -> the locked fallback", () => {
    // No seed fixture exists for this arm (MEH-1706) — constructed here.
    // Naming one of two certificates would be a misstatement.
    expect(cardKosherLabel(producerWith(["chalak", "badatz"]))).toBe(FALLBACK);
  });

  it("a missing kashrut_badges field does not crash the row", () => {
    const producer = producerWith(undefined);
    delete producer.kashrut_badges;
    expect(cardKosherLabel(producer)).toBe(FALLBACK);
  });
});

describe("MEH-1711 — the whitelist survives (why the map is imported, not derived)", () => {
  it("drops an unknown code instead of counting it", () => {
    // One known + one unknown = ONE certification, so the name still shows.
    // A regex-derived key would have counted two and fallen back, and worse,
    // would have accepted the unknown code as a real i18n lookup.
    expect(cardKosherLabel(producerWith(["chalak", "not-a-real-code"]))).toBe(
      he.kashrut.badges.chalak.label,
    );
  });

  it("falls back when every code is unknown", () => {
    expect(cardKosherLabel(producerWith(["nope", "also-nope"]))).toBe(FALLBACK);
  });

  it("uses the same map the detail page owns", () => {
    // Structural: one owner. If KashrutBadgeStrip's map changes, this import
    // changes with it — there is no second copy to drift.
    expect(CODE_TO_KEY.chalak).toBe("chalak");
    expect(CODE_TO_KEY["organic-kosher"]).toBe("organic_kosher");
    expect(CODE_TO_KEY["not-a-real-code"]).toBeUndefined();
  });
});

describe("MEH-1711 — the bare word is gone, and the gates are not", () => {
  it('BADGE_CONFIG.kosher.label is no longer the bare "כשר"', () => {
    expect(BADGE_CONFIG.kosher.label).not.toBe("כשר");
    expect(BADGE_CONFIG.kosher.label).toBe(FALLBACK);
  });

  it('no consumer surface renders the bare "כשר" as its own word', () => {
    // Word-boundary-ish check: "כשרות מאומתת" legitimately CONTAINS "כשר" as a
    // prefix, so a naive substring test would pass on the very string we are
    // trying to distinguish. Compare the whole rendered token instead.
    for (const codes of [["chalak"], [], ["chalak", "badatz"]]) {
      expect(cardKosherLabel(producerWith(codes))).not.toBe("כשר");
    }
  });

  it("earnsBadge is untouched — the same producers earn the badge", () => {
    // WHO earns it is the MEH-986 verified-only gate + the MEH-1260 expiry
    // gate. This ticket changes only WHAT IT SAYS.
    const keys = (p) => allBadges(p).map((b) => b.key);
    expect(keys(producerWith(["chalak"]))).toContain("kosher");
    expect(keys(producerWith([]))).toContain("kosher"); // stamp, no codes: still earned
    // No stamp -> not earned, codes present or not (MEH-986).
    expect(keys({ id: 1, name: "x", kashrut_badges: ["chalak"] })).not.toContain("kosher");
    // Expired stamp -> not earned (MEH-1260).
    expect(
      keys({
        id: 1,
        name: "x",
        kashrut_badges: ["chalak"],
        kashrut_verified_at: "2020-01-01T00:00:00Z",
        kashrut_expires_at: "2021-01-01T00:00:00Z",
      }),
    ).not.toContain("kosher");
  });
});
