/**
 * MEH-2952 chunk 4 — «עסק בדיקה — מוסתר מהאתר» on the admin edit screen and
 * its marker in the admin list. The switch reads its state from
 * GET /admin/test-businesses (ids only) and writes PUT
 * /admin/test-businesses/{id} with `{ hidden }` — never the column name.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const LABEL = he.admin.producers.test_business.label;
// Real uuids: the hook and the switch parse the generated zod schemas (rule 19).
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// The hook caches per module; a fresh module per test keeps them independent.
async function load() {
  vi.resetModules();
  const Toggle = (await import("@/components/admin/TestBusinessToggle")).default;
  const Tag = (await import("@/components/admin/TestBusinessTag")).default;
  return { Toggle, Tag };
}

beforeEach(() => vi.clearAllMocks());

describe("TestBusinessToggle", () => {
  // MEH-3872: while the ids load, the row's place is held (no switch yet), so
  // the panels under the header do not drop when the switch arrives.
  it("while the ids load: an empty row of the switch row's height, no switch", async () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    const { Toggle } = await load();
    wrap(<Toggle producerId={P1} />);
    const held = screen.getByTestId("admin-test-business-toggle-pending");
    expect(held).toHaveClass("mt-3", "h-6");
    expect(held).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("is the approved label, unchecked for a real business", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [OTHER] } });
    const { Toggle } = await load();
    wrap(<Toggle producerId={P1} />);
    const box = await screen.findByRole("switch", { name: LABEL });
    expect(LABEL).toBe("עסק בדיקה — מוסתר מהאתר");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(api.get).toHaveBeenCalledWith("/admin/test-businesses");
  });

  it("checked when the id is listed; turning it off sends hidden:false", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [P1] } });
    api.put.mockResolvedValue({ data: { producer_id: P1, hidden: false } });
    const { Toggle } = await load();
    wrap(<Toggle producerId={P1} />);
    const box = await screen.findByRole("switch", { name: LABEL });
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("false"));
    expect(api.put).toHaveBeenCalledWith(`/admin/test-businesses/${P1}`, { hidden: false });
    expect(showToast.success).toHaveBeenCalled();
  });

  it("turning it on sends hidden:true and the list tag appears", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [] } });
    api.put.mockResolvedValue({ data: { producer_id: P1, hidden: true } });
    const { Toggle, Tag } = await load();
    wrap(
      <>
        <Toggle producerId={P1} />
        <Tag producerId={P1} />
      </>,
    );
    const box = await screen.findByRole("switch", { name: LABEL });
    expect(screen.queryByTestId("admin-tag-test-business")).toBeNull();
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
    expect(api.put).toHaveBeenCalledWith(`/admin/test-businesses/${P1}`, { hidden: true });
    expect(await screen.findByTestId("admin-tag-test-business")).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(1); // one request shared by both
  });

  it("a failed save keeps the old state and says so", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [] } });
    api.put.mockRejectedValue(new Error("500"));
    const { Toggle } = await load();
    wrap(<Toggle producerId={P1} />);
    const box = await screen.findByRole("switch", { name: LABEL });
    fireEvent.click(box);
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(box.getAttribute("aria-checked")).toBe("false");
  });
});

describe("a failed read", () => {
  it("shows neither an unchecked switch nor a tag — unknown is not public", async () => {
    api.get.mockRejectedValue(new Error("500"));
    const { Toggle, Tag } = await load();
    wrap(
      <>
        <Toggle producerId={P1} />
        <Tag producerId={P1} />
      </>,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByTestId("admin-tag-test-business")).toBeNull();
  });
});

describe("TestBusinessTag", () => {
  it("a malformed list body renders nothing (rule 19: parse, never trust)", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: ["not-a-uuid"] } });
    const { Tag } = await load();
    wrap(<Tag producerId="not-a-uuid" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("admin-tag-test-business")).toBeNull();
  });

  it("a client that returns no promise renders nothing and does not throw", async () => {
    // AdminDraftMissing.test.jsx mocks api.get as a bare vi.fn(): undefined.
    api.get.mockReturnValue(undefined);
    const { Tag } = await load();
    wrap(<Tag producerId={P1} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("admin-tag-test-business")).toBeNull();
  });

  it("renders only for a listed id", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [P2] } });
    const { Tag } = await load();
    wrap(
      <>
        <Tag producerId={P1} />
        <Tag producerId={P2} />
      </>,
    );
    const tags = await screen.findAllByTestId("admin-tag-test-business");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe(LABEL);
  });
});
