import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1672: tap a kashrut badge that has an approved, in-date certificate →
// a modal shows the photo + validity + who verified it + the "original at
// the business" caveat. A badge WITHOUT a listed cert stays exactly as it
// rendered before this ticket — no button, no modal, no image src reaching
// the DOM. Both variants (chips + quiet) share the same tappability rule.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const date = vars?.date ?? "";
    const count = vars?.count ?? "";
    const map = {
      "expiry.valid_until": `בתוקף עד ${date}`,
      "expiry.near_expiry": "פג בקרוב",
      "badges.badatz.label": "בד״ץ",
      "badges.badatz.tooltip": "כשרות בד״ץ",
      "badges.rabanut.label": "רבנות",
      "badges.rabanut.tooltip": "כשרות רבנות",
      "cert.dialog_label": "תעודת כשרות",
      "cert.close": "סגירה",
      "cert.image_alt": "צילום תעודת הכשרות",
      "cert.verified_by": "אומתה על ידי מהמקור",
      "cert.original_at_business": "התעודה המקורית מוצגת בבית העסק",
    };
    return map[key] ?? key;
  },
  useFormatter: () => ({ dateTime: () => "01/01/2027" }),
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { StarOfDavid: Stub, X: Stub };
});

import KashrutBadgeStrip from "@/components/KashrutBadgeStrip";

const FUTURE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

function setup(props) {
  return render(
    <KashrutBadgeStrip
      badges={["badatz", "rabanut"]}
      verified_at="2027-01-01T00:00:00Z"
      expires_at={FUTURE}
      certs={[{ badge_code: "badatz" }]}
      producerId="123"
      {...props}
    />,
  );
}

beforeEach(() => {
  document.body.style.overflow = "";
});

describe("KashrutBadgeStrip certificate viewer — chips variant (MEH-1672)", () => {
  it("a badge WITH a cert is a tappable button", () => {
    setup();
    const trigger = screen.getByTestId("kashrut-cert-trigger-badatz");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("a badge WITHOUT a cert renders exactly as before — no button, no data-testid", () => {
    setup();
    expect(screen.queryByTestId("kashrut-cert-trigger-rabanut")).toBeNull();
    // The label still renders as a plain (non-interactive) element.
    const rabanut = screen.getByText("רבנות");
    expect(rabanut.tagName).not.toBe("BUTTON");
  });

  it("tapping the trigger opens the modal with the certificate proxy URL, validity, and both disclaimers", () => {
    setup();
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    expect(screen.getByTestId("kashrut-cert-modal")).toBeTruthy();
    const img = screen.getByTestId("kashrut-cert-image");
    // The proxy route, never a Cloudinary address.
    expect(img.getAttribute("src")).toBe("/api/producers/123/kashrut-cert/badatz");
    expect(screen.getByText(/בתוקף עד/)).toBeTruthy();
    expect(screen.getByText("אומתה על ידי מהמקור")).toBeTruthy();
    expect(screen.getByText("התעודה המקורית מוצגת בבית העסק")).toBeTruthy();
  });

  it("exactly ONE modal is open even with two certified badges", () => {
    setup({ certs: [{ badge_code: "badatz" }, { badge_code: "rabanut" }] });
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    expect(screen.getAllByTestId("kashrut-cert-modal")).toHaveLength(1);
    // Switching to the other badge replaces it — still exactly one.
    fireEvent.click(screen.getByTestId("kashrut-cert-close"));
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-rabanut"));
    expect(screen.getAllByTestId("kashrut-cert-modal")).toHaveLength(1);
    expect(screen.getByTestId("kashrut-cert-image").getAttribute("src")).toBe(
      "/api/producers/123/kashrut-cert/rabanut",
    );
  });

  it("closes on the X button, the backdrop, and Escape", () => {
    setup();
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    fireEvent.click(screen.getByTestId("kashrut-cert-close"));
    expect(screen.queryByTestId("kashrut-cert-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    fireEvent.click(screen.getByTestId("kashrut-cert-modal"));
    expect(screen.queryByTestId("kashrut-cert-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("kashrut-cert-modal")).toBeNull();
  });

  it("no producerId → no badge becomes tappable, even with certs listed", () => {
    setup({ producerId: null });
    expect(screen.queryByTestId("kashrut-cert-trigger-badatz")).toBeNull();
  });
});

/**
 * MEH-2129 — initial focus must fire once per OPEN, never once per render.
 *
 * Both call sites pass `onClose` as an inline arrow (`KashrutBadgeStrip.jsx`
 * :220 and :277), so its identity changes on every parent render. While the
 * `.focus()` call shared the `[onClose]` effect, each of those renders tore the
 * effect down and rebuilt it, re-firing `.focus()` and dragging focus back to
 * the close button out from under whoever had tabbed into the modal.
 *
 * The test discriminates by construction: with the old single effect it fails
 * (focus returns to the close button); with the split mount-only effect it
 * passes. jsdom moves focus only when something calls `.focus()` explicitly,
 * so nothing else in the render can produce this result.
 */
describe("CertModal initial focus is mount-only (MEH-2129)", () => {
  const props = {
    badges: ["badatz", "rabanut"],
    verified_at: "2027-01-01T00:00:00Z",
    expires_at: FUTURE,
    certs: [{ badge_code: "badatz" }],
    producerId: "123",
  };

  it("moves initial focus to the close button when the modal opens", () => {
    render(<KashrutBadgeStrip {...props} />);
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    expect(document.activeElement).toBe(screen.getByTestId("kashrut-cert-close"));
  });

  it("a parent re-render while the modal is open does NOT steal focus back", () => {
    const { rerender } = render(<KashrutBadgeStrip {...props} />);
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));

    // Stand in for "the visitor tabbed somewhere". A real element, so the
    // assertion below distinguishes "focus stayed put" from "focus was lost".
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    // Any parent render at all — the modal stays open across it.
    rerender(<KashrutBadgeStrip {...props} />);

    expect(screen.getByTestId("kashrut-cert-modal")).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("re-opening after a close focuses the close button again", () => {
    render(<KashrutBadgeStrip {...props} />);
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    fireEvent.click(screen.getByTestId("kashrut-cert-close"));
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    expect(document.activeElement).toBe(screen.getByTestId("kashrut-cert-close"));
  });
});

/**
 * MEH-2039 — the Tab trap and the scroll lock, guarded at the vitest gate.
 *
 * Added under MEH-2129 because this file carried ZERO focus or Tab assertions
 * (measured: `grep -c` returned 0 for both) — the only evidence for this
 * modal's trap lived in frontend/e2e/qa-meh2039-modal-a11y.mjs, a hand-run
 * script no CI job executes. The MEH-2129 diff edits that very effect, so
 * "the trap still works" needed a gate rather than a claim. Same three
 * assertions as LocationModal.test.jsx:115-140.
 */
describe("CertModal dialog contract (MEH-2039)", () => {
  it("traps Tab inside the panel", () => {
    setup();
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    const panel = screen.getByTestId("kashrut-cert-close").closest("div");
    const focusables = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    // This modal's panel holds exactly one focusable (the close button), so
    // the trap's correct behaviour is to hold focus ON it in both directions.
    expect(focusables.length).toBe(1);
    const only = focusables[0];

    only.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(only);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(only);
  });

  it("locks body scroll while open and restores it on close", () => {
    document.body.style.overflow = "auto";
    setup();
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByTestId("kashrut-cert-close"));
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("KashrutBadgeStrip certificate viewer — quiet variant", () => {
  it("only the certified label is a button; the rest of the line is unchanged", () => {
    setup({ variant: "quiet" });
    const line = screen.getByTestId("kashrut-quiet-line");
    expect(line.textContent).toContain("בד״ץ");
    expect(line.textContent).toContain("רבנות");
    expect(screen.getByTestId("kashrut-cert-trigger-badatz").tagName).toBe("BUTTON");
    expect(screen.queryByTestId("kashrut-cert-trigger-rabanut")).toBeNull();
  });

  it("opens the same modal shape as the chips variant", () => {
    setup({ variant: "quiet" });
    fireEvent.click(screen.getByTestId("kashrut-cert-trigger-badatz"));
    expect(screen.getByTestId("kashrut-cert-image").getAttribute("src")).toBe(
      "/api/producers/123/kashrut-cert/badatz",
    );
  });
});
