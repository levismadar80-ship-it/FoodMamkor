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

// The GET's real shape (GetOrderSettingsAsAdmin… in lib/generated/api.zod.js).
const settings = (alcohol) => ({
  producer_id: "7d1f5f3e-1c2b-4e5a-9f00-000000000001", enabled: false, alcohol_licensed: alcohol,
  auto_confirm: false, auto_confirm_slot_cap: null, business_id_number: null, cancel_cutoff_hours: 24,
  lead_time_hours: 24, min_order_agorot: null, shabbat_observant: false, slot_minutes: 60,
});

describe("AdminAlcoholPanel", () => {
  beforeEach(() => { api.get.mockReset(); api.put.mockReset(); });

  it("reads the mark, then turns it on through the admin PUT", async () => {
    api.get.mockResolvedValueOnce({ data: settings(false) });
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

  // MEH-3872: the switch row's place is held, unseen, until the GET answers,
  // and gives way to the real switch in the same place.
  it("while loading: the switch row is held invisible and inert, then the real switch replaces it", async () => {
    let answer;
    api.get.mockReturnValueOnce(new Promise((r) => { answer = r; }));
    mount();
    const held = screen.getByTestId("alcohol-switch-pending");
    expect(held).toHaveClass("invisible");
    expect(held).toHaveAttribute("aria-hidden", "true");
    expect(held).toHaveAttribute("inert");
    expect(screen.queryByTestId("alcohol-switch")).toBeNull();
    answer({ data: settings(false) });
    expect(await screen.findByTestId("alcohol-switch")).toBeInTheDocument();
    expect(screen.queryByTestId("alcohol-switch-pending")).toBeNull();
  });

  it("renders nothing while on-site ordering is off (404)", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const { container } = mount();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("a failed save keeps the old state and shows the server's reason", async () => {
    api.get.mockResolvedValueOnce({ data: settings(true) });
    api.put.mockRejectedValueOnce({ response: { data: { detail: "בית עסק לא נמצא" } } });
    mount();
    const sw = await screen.findByTestId("alcohol-switch");
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByTestId("alcohol-error")).toHaveTextContent("בית עסק לא נמצא"));
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
  it("a malformed body is a load error, not a switch set to off (rule 19)", async () => {
    api.get.mockResolvedValueOnce({ data: { ...settings(false), alcohol_licensed: "yes" } });
    mount();
    expect(await screen.findByTestId("alcohol-error")).toBeInTheDocument();
    expect(screen.queryByTestId("alcohol-switch")).toBeNull();
  });
});
