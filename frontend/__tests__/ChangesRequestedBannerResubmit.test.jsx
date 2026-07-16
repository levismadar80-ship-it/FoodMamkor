/**
 * MEH-1236 — ChangesRequestedBanner resubmit-for-review button.
 *
 * Renders the banner directly under the real NextIntlClientProvider + he.json
 * (isolation, like EditTabImagesCard.test.jsx). Covers:
 *   • resubmit button visible when requested_changes is set
 *   • click → POST /producers/me/request-review → sent-state confirmation
 *     (button replaced by the confirmation line for the session)
 *   • error → visible alert, button stays for retry
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ChangesRequestedBanner from "@/app/[locale]/producer/dashboard/ChangesRequestedBanner";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const C = he.dashboard.producer.changes_requested;

function renderBanner(profile = { requested_changes: "חסרה תמונה" }) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ChangesRequestedBanner profile={profile} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangesRequestedBanner — resubmit (MEH-1236)", () => {
  it("shows the resubmit button when requested_changes is set", () => {
    renderBanner();
    expect(screen.getByTestId("resubmit-button")).toHaveTextContent(C.resubmit_cta);
  });

  it("renders nothing when requested_changes is null", () => {
    const { container } = renderBanner({ requested_changes: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("click → POST /producers/me/request-review → sent confirmation", async () => {
    api.post.mockResolvedValueOnce({});
    renderBanner();
    fireEvent.click(screen.getByTestId("resubmit-button"));
    await screen.findByTestId("resubmit-sent");
    expect(api.post).toHaveBeenCalledWith("/producers/me/request-review");
    // Button replaced by the confirmation line for the session.
    expect(screen.queryByTestId("resubmit-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("resubmit-sent")).toHaveTextContent(C.resubmit_sent);
  });

  it("error → visible alert, button stays for retry", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderBanner();
    fireEvent.click(screen.getByTestId("resubmit-button"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(C.resubmit_error);
    expect(screen.getByTestId("resubmit-button")).toBeInTheDocument();
  });
});
