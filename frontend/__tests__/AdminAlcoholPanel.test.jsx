// MEH-3524: the admin's alcohol mark. Before this panel nothing in the site
// called the PUT, so no business could ever sell alcohol (Sapir 14/11 rule).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminAlcoholPanel from "@/components/admin/AdminAlcoholPanel";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));

const copy = he.admin.producers.alcohol;
const mount = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminAlcoholPanel producerId="p-9" />
    </NextIntlClientProvider>,
  );

describe("AdminAlcoholPanel", () => {
  beforeEach(() => { api.get.mockReset(); api.put.mockReset(); });

  it("reads the mark, then turns it on through the admin PUT", async () => {
    api.get.mockResolvedValueOnce({ data: { alcohol_licensed: false } });
    api.put.mockResolvedValueOnce({ data: { alcohol_licensed: true } });
    mount();
    const sw = await screen.findByTestId("alcohol-switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(api.get).toHaveBeenCalledWith("/admin/producers/p-9/order-settings");
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
    expect(api.put).toHaveBeenCalledWith("/admin/producers/p-9/order-settings/alcohol", { alcohol_licensed: true });
    expect(screen.getByTestId("alcohol-saved")).toHaveTextContent(copy.saved);
  });

  it("renders nothing while on-site ordering is off (404)", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const { container } = mount();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("a failed save keeps the old state and shows the server's reason", async () => {
    api.get.mockResolvedValueOnce({ data: { alcohol_licensed: true } });
    api.put.mockRejectedValueOnce({ response: { data: { detail: "בית עסק לא נמצא" } } });
    mount();
    const sw = await screen.findByTestId("alcohol-switch");
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByTestId("alcohol-error")).toHaveTextContent("בית עסק לא נמצא"));
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
});
