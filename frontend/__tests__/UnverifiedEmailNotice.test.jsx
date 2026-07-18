import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
import api from "@/lib/api";

// MEH-1164 sub-chunk B — the inline form notice + resend CTA. Exercises the
// shared useResendVerification flow: idle → resend fires POST → sent state;
// and 429 → rate-limited copy.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@phosphor-icons/react", () => ({
  EnvelopeSimple: (props) => <span data-testid="icon-envelope" {...props} />,
}));

const GATE_TEXT = "auth.verify.publish_gate";
const RESEND_TEXT = "auth.verify.resend";
const SENT_TEXT = "auth.verify.sent";
const RATE_LIMITED_TEXT = "auth.verify.rate_limited";

describe("UnverifiedEmailNotice (MEH-1164 B)", () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it("renders the gate message and the resend CTA", () => {
    render(<UnverifiedEmailNotice />);
    expect(screen.getByText(GATE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RESEND_TEXT })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("fires POST /auth/resend-verify and shows the sent state on click", async () => {
    api.post.mockResolvedValueOnce({});
    render(<UnverifiedEmailNotice />);
    fireEvent.click(screen.getByRole("button", { name: RESEND_TEXT }));
    await waitFor(() => expect(screen.getByText(SENT_TEXT)).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith("/auth/resend-verify");
    expect(screen.queryByRole("button", { name: RESEND_TEXT })).toBeNull();
  });

  it("shows the rate-limited copy on a 429", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429 } });
    render(<UnverifiedEmailNotice />);
    fireEvent.click(screen.getByRole("button", { name: RESEND_TEXT }));
    await waitFor(() => expect(screen.getByText(RATE_LIMITED_TEXT)).toBeInTheDocument());
    expect(screen.queryByText(SENT_TEXT)).toBeNull();
  });
});
