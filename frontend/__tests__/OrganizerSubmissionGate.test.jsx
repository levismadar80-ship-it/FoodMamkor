/**
 * MEH-2460 — the organizer submission gate (kind='organizer', ADR-036).
 *
 *  1. Parity with the server: backend/app/services/submission_gate.py declares
 *     ORGANIZER_MISSING_* codes and an ORGANIZER_SUBMISSION_REQUIREMENTS tuple;
 *     the client must carry the same codes in the same order. Parsed from the
 *     Python SOURCE (a mirror of the JS constants would be tautological), with
 *     a self-test first so a parser that matches nothing cannot pass vacuously.
 *  2. The client gate itself: an organizer is never asked for products,
 *     categories or a location; it is asked for description + upcoming event.
 *  3. The draft banner lists the organizer codes (a list filtered through the
 *     business requirement set would silently drop them) and links each one.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MISSING_CATEGORY,
  MISSING_IMAGE,
  MISSING_LOCATION,
  MISSING_PHONE_VERIFIED,
  MISSING_PRODUCT,
  ORGANIZER_MISSING_DESCRIPTION,
  ORGANIZER_MISSING_EVENT,
  ORGANIZER_SUBMISSION_REQUIREMENTS,
  submissionMissingItems,
} from "@/lib/submission-gate";
import DraftSubmitBanner from "@/components/producer/DraftSubmitBanner";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/PhoneVerifyCard", () => ({
  default: () => <div data-testid="phone-verify-card" />,
}));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(
  path.join(HERE, "..", "..", "backend", "app", "services", "submission_gate.py"),
  "utf8",
);

/** NAME -> code for every `(ORGANIZER_)?MISSING_X = "code"` assignment. */
function codeTable(source) {
  return Object.fromEntries(
    [...source.matchAll(/^((?:ORGANIZER_)?MISSING_[A-Z_]+)\s*=\s*"([a-z_]+)"$/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );
}

/** The organizer tuple's identifiers, in order, resolved to codes. */
function organizerTuple(source) {
  const [, after] = source.split(/^ORGANIZER_SUBMISSION_REQUIREMENTS[^=]*=\s*\(/m);
  if (after === undefined) return null;
  const table = codeTable(source);
  return [...after.split(")")[0].matchAll(/\b((?:ORGANIZER_)?MISSING_[A-Z_]+)\b/g)].map(
    (m) => table[m[1]],
  );
}

describe("organizer gate — parity with the server", () => {
  it("self-test: the parsers find the real tuple and discriminate", () => {
    const parsed = organizerTuple(SOURCE);
    expect(parsed, "ORGANIZER_SUBMISSION_REQUIREMENTS not found").not.toBeNull();
    expect(parsed.length).toBeGreaterThanOrEqual(4);
    expect(parsed.every(Boolean), "an identifier in the tuple has no code").toBe(true);
    expect(organizerTuple("MISSING_X = \"x\"\n")).toBeNull();
  });

  it("client and server declare the same organizer codes in the same order", () => {
    expect(organizerTuple(SOURCE)).toEqual(ORGANIZER_SUBMISSION_REQUIREMENTS);
  });
});

const ORG_COMPLETE = {
  kind: "organizer",
  status: "draft",
  images: ["https://res.cloudinary.com/x/image/upload/a.jpg"],
  description: "שוק יצרנים נודד",
  upcoming_events_count: 1,
  phone_verified: true,
  products: [],
  categories: [],
  locations: [],
};

describe("organizer gate — client", () => {
  it("a complete organizer is ready with no products, categories or location", () => {
    expect(submissionMissingItems(ORG_COMPLETE)).toEqual([]);
  });

  it("an empty organizer misses exactly its four items, never the business ones", () => {
    const missing = submissionMissingItems({
      kind: "organizer",
      images: [],
      description: "  ",
      phone_verified: false,
    });
    expect(missing).toEqual([
      MISSING_IMAGE,
      ORGANIZER_MISSING_DESCRIPTION,
      ORGANIZER_MISSING_EVENT,
      MISSING_PHONE_VERIFIED,
    ]);
    for (const code of [MISSING_PRODUCT, MISSING_CATEGORY, MISSING_LOCATION]) {
      expect(missing).not.toContain(code);
    }
  });

  it("zero upcoming events → the event item (count absent reads as 0, fail-closed)", () => {
    const { upcoming_events_count, ...noCount } = ORG_COMPLETE;
    expect(submissionMissingItems({ ...ORG_COMPLETE, upcoming_events_count: 0 })).toEqual([
      ORGANIZER_MISSING_EVENT,
    ]);
    expect(submissionMissingItems(noCount)).toEqual([ORGANIZER_MISSING_EVENT]);
    expect(upcoming_events_count).toBe(1);
  });

  it("a business row is unchanged: still asked for product / category / location", () => {
    const missing = submissionMissingItems({ ...ORG_COMPLETE, kind: "producer" });
    expect(missing).toEqual(
      expect.arrayContaining([MISSING_PRODUCT, MISSING_CATEGORY, MISSING_LOCATION]),
    );
  });
});

describe("organizer gate — draft banner", () => {
  it("lists the organizer codes and links each to where it is filled in", () => {
    render(
      <DraftSubmitBanner
        producer={{ ...ORG_COMPLETE, description: "", upcoming_events_count: 0 }}
      />,
    );
    expect(screen.getByTestId(`draft-missing-${ORGANIZER_MISSING_DESCRIPTION}`)).toBeInTheDocument();
    expect(screen.getByTestId(`draft-missing-${ORGANIZER_MISSING_EVENT}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`draft-missing-link-${ORGANIZER_MISSING_DESCRIPTION}`).getAttribute("href"),
    ).toBe("/producer/dashboard/edit#bio");
    expect(
      screen.getByTestId(`draft-missing-link-${ORGANIZER_MISSING_EVENT}`).getAttribute("href"),
    ).toBe("/producer/dashboard/events");
  });

  it("both locales carry a label for each organizer code (approved copy in he)", () => {
    for (const code of [ORGANIZER_MISSING_DESCRIPTION, ORGANIZER_MISSING_EVENT]) {
      expect(he.dashboard.producer.draft.missing[code]).toBeTruthy();
      expect(en.dashboard.producer.draft.missing[code]).toBeTruthy();
    }
    expect(he.dashboard.producer.draft.missing.description).toBe("כמה מילים על השוק או האירועים");
    expect(he.dashboard.producer.draft.missing.upcoming_event).toBe("אירוע קרוב אחד לפחות");
  });
});
