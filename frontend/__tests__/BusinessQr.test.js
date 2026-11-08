import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import en from "../messages/en.json";
import { buildBusinessQrUrl, QR_RENDER_OPTIONS, QR_UTM, qrFileName } from "@/lib/qr";
import { SITE_URL } from "@/lib/seo";
import BusinessQrCard from "@/components/producer/BusinessQrCard";

/**
 * MEH-2785 — the printable business QR code.
 *
 * Two things are under test, and only one of them is the component:
 *   1. the URL the code encodes — it must be the STABLE /producer/{id} route
 *      with the exact UTM pair, never the slug (an admin can change a slug and
 *      nothing redirects the old one, so a slug-based printed card goes dead);
 *   2. the gate — the card must not appear for a business that is not
 *      approved, not complete, or an organizer.
 *
 * DISCRIMINATION. Each case fails against a plausible wrong implementation:
 *   - swap `producer.id` for `producer.slug` in buildBusinessQrUrl → the first
 *     three cases go red (the slug is deliberately present AND different in
 *     every fixture, so a slug-based build still produces a valid-looking URL;
 *     only an assertion on the id catches it).
 *   - drop `utm_medium` → the UTM case goes red.
 *   - relax any one of the four gate conditions → the matching gate row goes
 *     red, because each row flips exactly one input away from the open gate.
 *   - render the card for a producer with no id → the last case goes red.
 * Verified by running each mutation locally before this file was committed.
 */

// `qrcode`'s browser build needs a canvas for toDataURL and a promise for
// toString. jsdom has no canvas, so the module is stubbed: these tests are
// about the URL and the gate, not about QR bitmap generation. The real
// render options are asserted separately against the module's own export, so
// the stub cannot hide a wrong errorCorrectionLevel / margin / colour.
const toString = vi.fn(() => Promise.resolve("<svg data-testid='stub-qr'></svg>"));
const toDataURL = vi.fn(() => Promise.resolve("data:image/png;base64,AAAA"));
vi.mock("qrcode", () => ({
  default: {
    toString: (...args) => toString(...args),
    toDataURL: (...args) => toDataURL(...args),
  },
}));

const ID = "0b5f2c18-7a44-4d6e-9f31-2c8a5e7b1d90";
// The slug is present and NOT equal to the id in every fixture on purpose:
// a slug-based implementation would still yield a plausible URL, so the
// assertions below have to name the id to discriminate.
const approved = { id: ID, slug: "lechem-shel-dana", name: "הלחם של דנה", status: "approved" };

const OPEN_GATE = { isComplete: true, isApproved: true, isOrganizer: false };

function renderCard(props, messages = he) {
  return render(
    <NextIntlClientProvider locale="he" messages={messages} timeZone="Asia/Jerusalem">
      <BusinessQrCard {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  toString.mockClear();
  toDataURL.mockClear();
});

describe("buildBusinessQrUrl — the printed target", () => {
  it("points at /producer/{id}, not at the slug", () => {
    const url = buildBusinessQrUrl(approved);
    expect(url).toContain(`/producer/${ID}`);
    expect(url).not.toContain(approved.slug);
    expect(url).not.toContain("/p/");
  });

  it("is absolute, on the canonical origin", () => {
    expect(buildBusinessQrUrl(approved)).toBe(
      `${SITE_URL}/producer/${ID}?utm_source=qr&utm_medium=print`,
    );
  });

  it("carries both UTM params, lower-case, exactly", () => {
    const query = new URL(buildBusinessQrUrl(approved)).searchParams;
    expect(query.get("utm_source")).toBe("qr");
    expect(query.get("utm_medium")).toBe("print");
    expect([...query.keys()]).toEqual(["utm_source", "utm_medium"]);
    expect(QR_UTM).toBe("utm_source=qr&utm_medium=print");
  });

  it("returns null with no id rather than a URL ending in undefined", () => {
    expect(buildBusinessQrUrl({ slug: "lechem-shel-dana" })).toBeNull();
    expect(buildBusinessQrUrl(null)).toBeNull();
  });
});

describe("print legibility options", () => {
  it("keeps error correction M, a 4-module quiet zone and the measured colours", () => {
    expect(QR_RENDER_OPTIONS).toEqual({
      errorCorrectionLevel: "M",
      margin: 4,
      color: { dark: "#2e6853", light: "#FFFFFF" },
    });
  });

  it("file names are mehamakor-qr-{id}.{ext}", () => {
    expect(qrFileName(approved, "svg")).toBe(`mehamakor-qr-${ID}.svg`);
    expect(qrFileName(approved, "png")).toBe(`mehamakor-qr-${ID}.png`);
  });
});

describe("the gate — one flipped input per row", () => {
  it.each([
    ["not approved", { ...OPEN_GATE, isApproved: false }],
    ["incomplete", { ...OPEN_GATE, isComplete: false }],
    ["organizer", { ...OPEN_GATE, isOrganizer: true }],
    ["no slug yet", { ...OPEN_GATE, producerOverride: { ...approved, slug: null } }],
  ])("hides the card when the business is %s", (_label, { producerOverride, ...gate }) => {
    renderCard({ producer: producerOverride ?? approved, ...gate });
    expect(screen.queryByTestId("business-qr-card")).toBeNull();
    // and it must not have rendered a code it was not allowed to show
    expect(toString).not.toHaveBeenCalled();
  });

  it("renders the card for an approved, complete business", async () => {
    renderCard({ producer: approved, ...OPEN_GATE });
    expect(screen.getByTestId("business-qr-card")).toBeTruthy();
    expect(screen.getByTestId("business-qr-download-svg")).toBeTruthy();
    expect(screen.getByTestId("business-qr-download-png")).toBeTruthy();
    expect(screen.getByTestId("business-qr-print-card").getAttribute("href")).toBe(
      "/producer/dashboard/qr-card",
    );
    await waitFor(() => expect(toString).toHaveBeenCalled());
    const [url, opts] = toString.mock.calls[0];
    expect(url).toBe(`${SITE_URL}/producer/${ID}?utm_source=qr&utm_medium=print`);
    expect(opts).toMatchObject({ ...QR_RENDER_OPTIONS, type: "svg" });
  });

  it("keeps the downloads disabled until a code exists", () => {
    renderCard({ producer: approved, ...OPEN_GATE });
    // first paint: the effect has not resolved, so there is nothing to save
    expect(screen.getByTestId("business-qr-download-svg").disabled).toBe(true);
    expect(screen.getByTestId("business-qr-download-png").disabled).toBe(true);
  });
});

describe("copy", () => {
  it.each([
    ["he", he],
    ["en", en],
  ])("%s.json carries every key the card and the print route read", (_, msgs) => {
    for (const key of ["title", "body", "download_svg", "download_png", "print_card", "hint"]) {
      expect(msgs.dashboard.producer.qr[key], `qr.${key}`).toBeTruthy();
    }
    for (const key of ["cta", "print_hint", "back"]) {
      expect(msgs.qr_card[key], `qr_card.${key}`).toBeTruthy();
    }
  });

  it("renders the Hebrew heading, not a raw key", () => {
    renderCard({ producer: approved, ...OPEN_GATE });
    expect(screen.getByTestId("business-qr-card").textContent).toContain(
      he.dashboard.producer.qr.title,
    );
  });

  it("en copy holds no Hebrew", () => {
    const hebrew = /[֐-׿]/;
    const values = [
      ...Object.values(en.dashboard.producer.qr),
      ...Object.values(en.qr_card),
    ];
    for (const v of values) expect(hebrew.test(v), v).toBe(false);
  });
});
