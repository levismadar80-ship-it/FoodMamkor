// MEH-3081: the admin attaches a kashrut certificate for a business with no
// owner account (19 «כשר» about texts, 18 of them with nobody to upload).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminKashrutPanel from "@/components/admin/AdminKashrutPanel";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const copy = he.admin.producers.kashrut_grant;
const CERT = "https://res.cloudinary.com/demo/image/upload/cert.jpg";
const mount = (props) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminKashrutPanel producerId="p-9" {...props} />
    </NextIntlClientProvider>,
  );

const fill = async () => {
  fireEvent.change(screen.getByTestId("kashrut-grant-code"), { target: { value: "rabanut" } });
  const file = new File(["x"], "cert.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("kashrut-grant-file"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText(copy.cert_label)).toHaveAttribute("src", CERT));
  fireEvent.change(screen.getByTestId("kashrut-grant-expires"), { target: { value: "2027-01-29" } });
};

describe("AdminKashrutPanel", () => {
  beforeEach(() => {
    api.post.mockReset();
    api.get.mockReset();
  });

  it("with no badge: says so, and the submit waits for code, photo and date", async () => {
    api.post.mockResolvedValueOnce({ data: { url: CERT } });
    mount({ badges: [] });
    expect(screen.getByTestId("kashrut-grant-none")).toHaveTextContent(copy.none);
    expect(screen.getByTestId("kashrut-grant-submit")).toBeDisabled();
    await fill();
    expect(screen.getByTestId("kashrut-grant-submit")).toBeEnabled();
  });

  it("uploads the photo, grants, and shows the badge the server now holds", async () => {
    api.post
      .mockResolvedValueOnce({ data: { url: CERT } })
      .mockResolvedValueOnce({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          producer_id: "22222222-2222-4222-8222-222222222222",
          badge_code: "rabanut",
          cert_url: CERT,
          status: "approved",
          notes: "צורף על ידי אדמין",
          created_at: "2026-11-27T10:00:00",
          producer_name: "המתססה",
        },
      });
    api.get.mockResolvedValueOnce({
      data: { kashrut_badges: ["rabanut"], kashrut_verified_at: "2026-11-27T10:00:00", kashrut_expires_at: "2027-01-29T21:59:59" },
    });
    mount({ badges: [] });
    await fill();
    fireEvent.click(screen.getByTestId("kashrut-grant-submit"));
    await waitFor(() => expect(screen.getByTestId("kashrut-grant-done")).toHaveTextContent(copy.done));
    expect(api.post).toHaveBeenNthCalledWith(1, "/upload/kashrut-cert", expect.any(FormData));
    expect(api.post).toHaveBeenNthCalledWith(2, "/admin/producers/p-9/kashrut", {
      badge_code: "rabanut",
      cert_url: CERT,
      expires_on: "2027-01-29",
    });
    expect(screen.queryByTestId("kashrut-grant-none")).toBeNull();
  });

  it("with badges already on: shows them instead of the none line", () => {
    mount({ badges: ["rabanut", "mehadrin"], verifiedAt: "2026-11-01T10:00:00", expiresAt: "2099-01-01T00:00:00" });
    expect(screen.queryByTestId("kashrut-grant-none")).toBeNull();
  });

  it("shows the server's Hebrew detail when the grant is refused", async () => {
    api.post
      .mockResolvedValueOnce({ data: { url: CERT } })
      .mockRejectedValueOnce({ response: { data: { detail: "קוד תג לא תקין" } } });
    mount({ badges: [] });
    await fill();
    fireEvent.click(screen.getByTestId("kashrut-grant-submit"));
    await waitFor(() => expect(screen.getByTestId("kashrut-grant-error")).toHaveTextContent("קוד תג לא תקין"));
    expect(screen.getByTestId("kashrut-grant-none")).toBeInTheDocument();
  });
});
