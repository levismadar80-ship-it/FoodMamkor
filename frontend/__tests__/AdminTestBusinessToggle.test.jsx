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
  it("is the approved label, unchecked for a real business", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: ["other"] } });
    const { Toggle } = await load();
    wrap(<Toggle producerId="p-1" />);
    const box = await screen.findByRole("switch", { name: LABEL });
    expect(LABEL).toBe("עסק בדיקה — מוסתר מהאתר");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(api.get).toHaveBeenCalledWith("/admin/test-businesses");
  });

  it("checked when the id is listed; turning it off sends hidden:false", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: ["p-1"] } });
    api.put.mockResolvedValue({ data: { producer_id: "p-1", hidden: false } });
    const { Toggle } = await load();
    wrap(<Toggle producerId="p-1" />);
    const box = await screen.findByRole("switch", { name: LABEL });
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("false"));
    expect(api.put).toHaveBeenCalledWith("/admin/test-businesses/p-1", { hidden: false });
    expect(showToast.success).toHaveBeenCalled();
  });

  it("turning it on sends hidden:true and the list tag appears", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [] } });
    api.put.mockResolvedValue({ data: { producer_id: "p-1", hidden: true } });
    const { Toggle, Tag } = await load();
    wrap(
      <>
        <Toggle producerId="p-1" />
        <Tag producerId="p-1" />
      </>,
    );
    const box = await screen.findByRole("switch", { name: LABEL });
    expect(screen.queryByTestId("admin-tag-test-business")).toBeNull();
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
    expect(api.put).toHaveBeenCalledWith("/admin/test-businesses/p-1", { hidden: true });
    expect(await screen.findByTestId("admin-tag-test-business")).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(1); // one request shared by both
  });

  it("a failed save keeps the old state and says so", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: [] } });
    api.put.mockRejectedValue(new Error("500"));
    const { Toggle } = await load();
    wrap(<Toggle producerId="p-1" />);
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
        <Toggle producerId="p-1" />
        <Tag producerId="p-1" />
      </>,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByTestId("admin-tag-test-business")).toBeNull();
  });
});

describe("TestBusinessTag", () => {
  it("renders only for a listed id", async () => {
    api.get.mockResolvedValue({ data: { producer_ids: ["p-2"] } });
    const { Tag } = await load();
    wrap(
      <>
        <Tag producerId="p-1" />
        <Tag producerId="p-2" />
      </>,
    );
    const tags = await screen.findAllByTestId("admin-tag-test-business");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe(LABEL);
  });
});
