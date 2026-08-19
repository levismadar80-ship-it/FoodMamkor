/**
 * MEH-2100 — the draft banner: which status renders it, when the CTA is live,
 * and what the submit action does.
 *
 * WHY THE CASES ARE SUBTRACTIVE. Every "this item is missing" case starts from
 * a producer that satisfies the whole gate and removes exactly one field.
 * Building up from an empty producer would leave the CTA disabled for reasons
 * the test never names, and would keep passing if the requirement under test
 * were deleted from the gate — the assertion would ride on the other four.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DraftSubmitBanner from "@/components/producer/DraftSubmitBanner";
import {
  submissionMissingItems,
  SUBMISSION_REQUIREMENTS,
} from "@/lib/submission-gate";
// The REAL locale files — the point of the copy check below is that it reads
// what ships, not what the next-intl mock echoes back.
import heMessages from "@/messages/he.json";
import enMessages from "@/messages/en.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: {
    post: (...a) => post(...a),
    get: vi.fn(),
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  showToast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    info: vi.fn(),
  },
}));

// PhoneVerifyCard owns its own endpoints; this suite is about the banner, so
// it is stubbed to a marker we can assert the PRESENCE of. That presence is
// the whole point of MEH-2100's blocking defect — see the mount test below.
//
// The stub also EXPOSES onVerified as a clickable control. A stub that only
// renders a marker makes the banner's own callback untestable, and an
// untestable callback is where `setServerMissing(null)` can be dropped in a
// refactor with nothing going red — the CTA would then stay disabled on stale
// server codes after a successful OTP, which is the gate closing behind a
// business that just satisfied it.
vi.mock("@/components/PhoneVerifyCard", () => ({
  default: ({ onVerified }) => (
    <button type="button" data-testid="phone-verify-card" onClick={onVerified}>
      verify
    </button>
  ),
}));

const READY = {
  images: ["https://res.cloudinary.com/demo/image/upload/x.jpg"],
  products: [{ id: "p1", name: "מוצר" }],
  categories: [{ id: 1, name: "קטגוריה" }],
  lat: 32.0853,
  lng: 34.7818,
  phone_verified: true,
  has_physical_location: true,
};

beforeEach(() => {
  post.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("the gate baseline is genuinely complete (self-test first)", () => {
  // MEH-1619: if READY is not actually complete, every "remove one field"
  // case below would disable the CTA for an unstated reason and pass anyway.
  it("READY satisfies every requirement, and removing one is noticed", () => {
    expect(submissionMissingItems(READY)).toEqual([]);
    expect(submissionMissingItems({ ...READY, images: [] })).toEqual(["image"]);
    expect(submissionMissingItems({ ...READY, phone_verified: false })).toEqual([
      "phone_verified",
    ]);
  });
});

describe("DraftSubmitBanner — CTA enablement", () => {
  it("CTA is enabled when nothing is missing", () => {
    render(<DraftSubmitBanner producer={READY} />);
    expect(screen.getByTestId("draft-submit-cta")).not.toBeDisabled();
    expect(screen.queryByTestId("draft-missing-list")).toBeNull();
  });

  it.each([
    ["image", { images: [] }],
    ["product", { products: [] }],
    ["category", { categories: [] }],
    ["location", { lat: null, lng: null }],
    ["phone_verified", { phone_verified: false }],
  ])("CTA is disabled and names %s when it alone is missing", (code, patch) => {
    render(<DraftSubmitBanner producer={{ ...READY, ...patch }} />);

    expect(screen.getByTestId("draft-submit-cta")).toBeDisabled();
    // Names the SPECIFIC item — a bare "disabled" assertion would pass even
    // if the banner blocked for an unrelated reason.
    expect(screen.getByTestId(`draft-missing-${code}`)).toBeTruthy();
  });

  // REPLACED a tautology (adversarial review, MEH-2100/#2987 — and they were
  // right). The old
  // version rendered a maximally-incomplete producer and asserted a row exists
  // for every code in SUBMISSION_REQUIREMENTS — but the banner ITERATES that
  // same list, so every declared code produces a row by construction. It could
  // not distinguish "this code is wired" from "all five happen to be missing",
  // and the `it.each` above already covers each code individually.
  //
  // Worse than useless: its comment claimed "adding a code without wiring copy
  // fails here", which was false — `useTranslations` is mocked to return the
  // key path, so a code with no he/en copy passed. An assertion that reads as
  // coverage while being entailed by its own subject is the exact shape
  // .claude/rules/testing.md warns about.
  //
  // This is the check that claim DESCRIBED, done against the real message
  // files, where it is not entailed by anything the component does.
  it("every declared requirement has real he + en copy", () => {
    // Guard the key path before indexing it. Without this a renamed namespace
    // throws "Cannot read properties of undefined" from inside the loop, which
    // says nothing about WHICH locale key moved — the same legibility problem
    // the parity parser had.
    const heMissing = heMessages?.dashboard?.producer?.draft?.missing;
    const enMissing = enMessages?.dashboard?.producer?.draft?.missing;
    expect(heMissing, "he.json dashboard.producer.draft.missing").toBeTruthy();
    expect(enMissing, "en.json dashboard.producer.draft.missing").toBeTruthy();

    for (const code of SUBMISSION_REQUIREMENTS) {
      const heCopy = heMissing[code];
      const enCopy = enMissing[code];
      expect(heCopy, `he copy for "${code}"`).toBeTruthy();
      expect(enCopy, `en copy for "${code}"`).toBeTruthy();
      // Not the key path echoed back, and not the other locale's string.
      expect(heCopy).not.toBe(code);
      expect(enCopy).not.toBe(code);
      expect(heCopy).not.toBe(enCopy);
    }
  });
});

describe("DraftSubmitBanner — the PhoneVerifyCard mount (MEH-2100 blocking defect)", () => {
  it("mounts the OTP card while the phone is unverified", () => {
    render(<DraftSubmitBanner producer={{ ...READY, phone_verified: false }} />);
    expect(screen.getByTestId("phone-verify-card")).toBeTruthy();
  });

  it("does NOT mount it once verified", () => {
    render(<DraftSubmitBanner producer={READY} />);
    expect(screen.queryByTestId("phone-verify-card")).toBeNull();
  });

  // This is the regression that would make the whole feature unusable: before
  // MEH-2100 the card existed only inside the `pending_whatsapp` banner, which
  // a draft never reaches — so phone_verified could never flip and the gate
  // could never be passed by anyone. That banner and its status were removed
  // in MEH-2124, which makes this mount the only one. If a refactor drops it, the two
  // assertions above go red rather than the feature silently dead-ending.

  // The mount alone is not enough: verifying has to CLEAR the codes the server
  // sent on a previous rejection. `serverMissing` is rendered in preference to
  // the local computation, so a stale list survives a successful OTP and the
  // CTA stays disabled — the gate closing behind a business that just
  // satisfied it, with the banner still naming an item she has completed.
  //
  // Reaching that state honestly matters: `serverMissing` is internal, so the
  // test provokes a real 422 first rather than injecting the state. That also
  // makes this the only case covering the full round trip
  // reject → verify → recover.
  it("verifying clears the SERVER's stale codes and re-enables the CTA", async () => {
    post.mockRejectedValue({
      response: {
        data: {
          detail: {
            code: "submit_gate_incomplete",
            message: "חסר משהו",
            params: { missing: ["phone_verified"] },
          },
        },
      },
    });
    // The client thinks this producer is complete; only the server disagrees.
    const onPhoneVerified = vi.fn();
    render(
      <DraftSubmitBanner producer={READY} onPhoneVerified={onPhoneVerified} />,
    );

    fireEvent.click(screen.getByTestId("draft-submit-cta"));
    fireEvent.click(screen.getByTestId("draft-submit-confirm-yes"));

    // Rejected: the server's code is now displayed and the CTA is blocked.
    await waitFor(() =>
      expect(screen.getByTestId("draft-missing-phone_verified")).toBeTruthy(),
    );
    expect(screen.getByTestId("draft-submit-cta")).toBeDisabled();

    // The OTP card is reachable precisely because the server flagged it.
    fireEvent.click(screen.getByTestId("phone-verify-card"));

    expect(onPhoneVerified).toHaveBeenCalled();
    expect(screen.queryByTestId("draft-missing-phone_verified")).toBeNull();
    expect(screen.getByTestId("draft-submit-cta")).not.toBeDisabled();
  });
});

describe("DraftSubmitBanner — submitting", () => {
  it("confirms before posting, then posts once", async () => {
    post.mockResolvedValue({ data: { detail: "ok" } });
    const onSubmitted = vi.fn();
    render(<DraftSubmitBanner producer={READY} onSubmitted={onSubmitted} />);

    fireEvent.click(screen.getByTestId("draft-submit-cta"));
    expect(post).not.toHaveBeenCalled(); // the confirm step is real

    fireEvent.click(screen.getByTestId("draft-submit-confirm-yes"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/producers/me/submit-for-review"),
    );
    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("toast_submitted");
  });

  it("cancelling the confirm posts nothing", () => {
    render(<DraftSubmitBanner producer={READY} />);
    fireEvent.click(screen.getByTestId("draft-submit-cta"));
    fireEvent.click(screen.getByTestId("draft-submit-confirm-no"));
    expect(post).not.toHaveBeenCalled();
    // Presence alone would pass on a CTA left stuck disabled after cancel —
    // the state the owner would then be unable to escape. Assert enablement.
    expect(screen.getByTestId("draft-submit-cta")).not.toBeDisabled();
  });

  it("confirm-yes is disabled when the profile stops being ready mid-confirm", () => {
    // The void-click: handleSubmit early-returns on !ready, so a confirm
    // button gated only on `submitting` would swallow the click with no
    // request and no toast. Rendering the confirm step against a
    // now-incomplete producer is the deterministic stand-in for the refetch
    // that causes it in the wild.
    const { rerender } = render(<DraftSubmitBanner producer={READY} />);
    fireEvent.click(screen.getByTestId("draft-submit-cta"));
    expect(screen.getByTestId("draft-submit-confirm-yes")).not.toBeDisabled();

    rerender(<DraftSubmitBanner producer={{ ...READY, images: [] }} />);
    expect(screen.getByTestId("draft-submit-confirm-yes")).toBeDisabled();
    fireEvent.click(screen.getByTestId("draft-submit-confirm-yes"));
    expect(post).not.toHaveBeenCalled();
  });

  it("a 422 renders the SERVER's missing list, not the client's guess", async () => {
    // The case that matters: the client thinks everything is present, the
    // server disagrees. The owner must see what the SERVER objected to —
    // showing the (empty) local computation would tell her nothing is wrong
    // while the submit keeps failing.
    post.mockRejectedValue({
      response: {
        data: {
          detail: {
            code: "submit_gate_incomplete",
            message: "חסר משהו",
            params: { missing: ["product"] },
          },
        },
      },
    });
    render(<DraftSubmitBanner producer={READY} />);
    fireEvent.click(screen.getByTestId("draft-submit-cta"));
    fireEvent.click(screen.getByTestId("draft-submit-confirm-yes"));

    await waitFor(() =>
      expect(screen.getByTestId("draft-missing-product")).toBeTruthy(),
    );
    expect(screen.getByTestId("draft-submit-cta")).toBeDisabled();
    expect(toastError).toHaveBeenCalled();
  });

  it("renders nothing without a producer (profile still loading)", () => {
    const { container } = render(<DraftSubmitBanner producer={null} />);
    expect(container.firstChild).toBeNull();
  });
});
