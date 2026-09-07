/**
 * MEH-2210 chunk B — RejectedBanner: reason-driven copy + the resubmit CTA.
 *
 * Renders the banner directly under the real NextIntlClientProvider + he.json
 * (ChangesRequestedBannerResubmit convention), so every assertion below is
 * against the shipped Hebrew, not a key echo. Covers the 5-state matrix the
 * card names: five code variants (line + deep link), count 2 → CTA +
 * "שליחה 3 מתוך 3", count 3 → no CTA + capped line, legacy null code → free
 * text + CTA, click → POST /producers/me/request-review + toast + parent
 * callback with the server's count, error → visible alert and the button
 * stays.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import RejectedBanner, { MAX_RESUBMISSIONS } from "@/app/[locale]/producer/dashboard/RejectedBanner";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const C = he.dashboard.producer.status.rejected;

function renderBanner(props = {}) {
  const onResubmitted = vi.fn();
  const onSupport = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RejectedBanner
        reason="התמונה מטושטשת"
        code="missing_image"
        count={0}
        onResubmitted={onResubmitted}
        onSupport={onSupport}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onResubmitted, onSupport };
}

beforeEach(() => vi.clearAllMocks());

describe("RejectedBanner — copy by reason code (MEH-2210)", () => {
  it.each([
    ["missing_docs", "/producer/dashboard/edit#license"],
    ["missing_image", "/producer/dashboard/edit#images"],
    ["incomplete_info", "/producer/dashboard/edit#contact-channels"],
  ])("%s → its line, linked to the card that fixes it", (code, href) => {
    renderBanner({ code });
    const line = screen.getByTestId("status-rejected-line");
    expect(line).toHaveTextContent(C.by_code[code]);
    expect(screen.getByTestId("status-rejected-fix-link")).toHaveAttribute("href", href);
    expect(screen.queryByTestId("status-rejected-hint")).not.toBeInTheDocument();
  });

  it("not_eligible → line without a card link, plus the 'if things changed' hint", () => {
    renderBanner({ code: "not_eligible" });
    expect(screen.getByTestId("status-rejected-line")).toHaveTextContent(C.by_code.not_eligible);
    expect(screen.queryByTestId("status-rejected-fix-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-hint")).toHaveTextContent(C.by_code.not_eligible_hint);
    // Still resubmittable — the code drives the COPY, never the permission.
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
  });

  it.each([["other"], [null]])("code %s → free text only, CTA still shown (legacy rows)", (code) => {
    renderBanner({ code, reason: "הכתובת לא ברורה" });
    expect(screen.queryByTestId("status-rejected-line")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-reason")).toHaveTextContent("הכתובת לא ברורה");
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
  });

  it("no free text → no quote block, the code line still renders", () => {
    renderBanner({ reason: null, code: "missing_image" });
    expect(screen.queryByTestId("status-rejected-reason")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-line")).toBeInTheDocument();
  });

  it("title is the fix-and-resubmit one, and the three generic tips are gone", () => {
    renderBanner();
    expect(screen.getByText(C.title)).toBeInTheDocument();
    // Absence assertion for the MEH-1355 bullets this banner replaces. The
    // keys no longer exist in he.json, so the strings are asserted literally.
    for (const gone of [
      "ודאו שכל פרטי העסק מלאים ומדויקים",
      "הוסיפו תמונות ברורות של המוצרים",
      "בדקו שכתובת העסק נכונה",
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(C.tip_photos).toBeUndefined();
  });
});

describe("RejectedBanner — the cap (MEH-2210)", () => {
  it("count 0 → CTA + 'שליחה 1 מתוך 3'", () => {
    renderBanner({ count: 0 });
    expect(screen.getByTestId("status-rejected-resubmit")).toHaveTextContent(C.resubmit_cta);
    expect(screen.getByTestId("status-rejected-caption")).toHaveTextContent("שליחה 1 מתוך 3");
    expect(screen.queryByTestId("status-rejected-capped")).not.toBeInTheDocument();
  });

  it("count 2 → CTA + 'שליחה 3 מתוך 3' (the last one)", () => {
    renderBanner({ count: 2 });
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-caption")).toHaveTextContent("שליחה 3 מתוך 3");
  });

  it("count 3 → no CTA, the capped line, support still offered", () => {
    expect(MAX_RESUBMISSIONS).toBe(3);
    const { onSupport } = renderBanner({ count: 3 });
    expect(screen.queryByTestId("status-rejected-resubmit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("status-rejected-caption")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-capped")).toHaveTextContent(C.capped);
    fireEvent.click(screen.getByTestId("status-rejected-support"));
    expect(onSupport).toHaveBeenCalledTimes(1);
  });

  it("a missing/garbage count reads as 0, never as capped", () => {
    renderBanner({ count: undefined });
    expect(screen.getByTestId("status-rejected-caption")).toHaveTextContent("שליחה 1 מתוך 3");
  });
});

describe("RejectedBanner — the click (MEH-2210)", () => {
  it("click → POST /producers/me/request-review → toast + parent gets the server count", async () => {
    api.post.mockResolvedValueOnce({ data: { detail: "נשלח", status: "pending", resubmission_count: 1 } });
    const { onResubmitted } = renderBanner({ count: 0 });
    fireEvent.click(screen.getByTestId("status-rejected-resubmit"));
    await waitFor(() => expect(onResubmitted).toHaveBeenCalledWith(1));
    expect(api.post).toHaveBeenCalledWith("/producers/me/request-review");
    expect(showToast.success).toHaveBeenCalledWith(C.resubmit_toast);
    expect(screen.queryByTestId("status-rejected-error")).not.toBeInTheDocument();
  });

  it("409 at the cap → the server's detail is shown, button stays, parent NOT called", async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { detail: "הגעתן למספר השליחות המקסימלי — צרו איתנו קשר" } },
    });
    const { onResubmitted } = renderBanner({ count: 2 });
    fireEvent.click(screen.getByTestId("status-rejected-resubmit"));
    const err = await screen.findByTestId("status-rejected-error");
    expect(err).toHaveTextContent("הגעתן למספר השליחות המקסימלי");
    expect(onResubmitted).not.toHaveBeenCalled();
    expect(showToast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
  });

  it("network error → the generic error line, button stays for retry", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderBanner();
    fireEvent.click(screen.getByTestId("status-rejected-resubmit"));
    const err = await screen.findByTestId("status-rejected-error");
    expect(err).toHaveTextContent(C.resubmit_error);
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
  });
});
