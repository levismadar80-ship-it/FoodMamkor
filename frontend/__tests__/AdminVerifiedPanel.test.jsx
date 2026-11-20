// MEH-3524: the admin's only way to give or remove «מאומת». Before this panel
// nothing in the site called grant-verified (found by the MEH-3523 guard).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminVerifiedPanel from "@/components/admin/AdminVerifiedPanel";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const copy = he.admin.producers.verified;
const mount = (props) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminVerifiedPanel producerId="p-9" {...props} />
    </NextIntlClientProvider>,
  );

describe("AdminVerifiedPanel", () => {
  beforeEach(() => api.post.mockReset());

  it("grants with the chosen document and flips to the on state", async () => {
    api.post.mockResolvedValue({ data: {} });
    mount({});
    expect(screen.getByTestId("verified-state-off")).toHaveTextContent(copy.state_off);
    expect(screen.queryByTestId("verified-revoke")).toBeNull();
    fireEvent.change(screen.getByTestId("verified-doc"), { target: { value: "cosmetics" } });
    fireEvent.click(screen.getByTestId("verified-grant"));
    await waitFor(() => expect(screen.getByTestId("verified-state-on")).toHaveTextContent(copy.doc_cosmetics));
    expect(api.post).toHaveBeenCalledWith("/admin/producers/p-9/grant-verified", { doc_type: "cosmetics" });
    expect(screen.getByTestId("verified-done")).toHaveTextContent(copy.done_granted);
  });

  it("revokes only after the confirm step", async () => {
    api.post.mockResolvedValue({ data: {} });
    mount({ verifiedAt: "2026-10-01T09:00:00Z", docType: "exemption" });
    expect(screen.getByTestId("verified-state-on")).toHaveTextContent(copy.doc_exemption);
    fireEvent.click(screen.getByTestId("verified-revoke"));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("verified-revoke-yes"));
    await waitFor(() => expect(screen.getByTestId("verified-state-off")).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith("/admin/producers/p-9/revoke-verified");
    expect(screen.getByTestId("verified-done")).toHaveTextContent(copy.done_revoked);
  });

  it("shows the server's Hebrew detail when the grant is refused", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { detail: "העסק לא נמצא" } } });
    mount({});
    fireEvent.click(screen.getByTestId("verified-grant"));
    await waitFor(() => expect(screen.getByTestId("verified-error")).toHaveTextContent("העסק לא נמצא"));
    expect(screen.getByTestId("verified-state-off")).toBeInTheDocument();
  });

  it("an organizer gets a note and no buttons", () => {
    mount({ kind: "organizer" });
    expect(screen.getByTestId("verified-organizer")).toHaveTextContent(copy.organizer);
    expect(screen.queryByTestId("verified-grant")).toBeNull();
  });
});
